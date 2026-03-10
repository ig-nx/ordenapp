from datetime import timedelta

from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from .forms import SignUpForm, TaskForm
from .models import PomodoroSession, Task


def serialize_task(task):
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "estimated_minutes": task.estimated_minutes,
        "status": task.status,
        "priority": task.priority,
    }


def build_summary(user):
    tasks = Task.objects.filter(user=user)
    aggregates = tasks.aggregate(
        total=Count("id"),
        completed=Count("id", filter=Q(status=Task.Status.COMPLETED)),
    )
    total = aggregates["total"] or 0
    completed = aggregates["completed"] or 0
    pending = total - completed
    progress = int((completed / total) * 100) if total else 0
    today = timezone.localdate()
    pomodoros_today = PomodoroSession.objects.filter(
        user=user,
        completed_at__date=today,
    ).count()
    return {
        "total": total,
        "completed": completed,
        "pending": pending,
        "progress": progress,
        "pomodoros_today": pomodoros_today,
    }


def empty_summary():
    return {
        "total": 0,
        "completed": 0,
        "pending": 0,
        "progress": 0,
        "pomodoros_today": 0,
    }


def serialize_form_errors(form):
    return {
        field: [str(error) for error in errors]
        for field, errors in form.errors.items()
    }


def home(request):
    initial_tasks = []
    summary = empty_summary()

    if request.user.is_authenticated:
        queryset = Task.objects.filter(user=request.user)
        initial_tasks = [serialize_task(task) for task in queryset]
        summary = build_summary(request.user)

    context = {
        "task_form": TaskForm(),
        "task_priorities": [
            {"value": value, "label": label} for value, label in Task.Priority.choices
        ],
        "minute_options": [
            {"value": value, "label": label} for value, label in Task.ESTIMATED_MINUTES_CHOICES
        ],
        "pomodoro_durations": [5, 10, 15, 30, 45, 60],
        "initial_tasks": initial_tasks,
        "summary": summary,
    }
    return render(request, "core/home.html", context)


def signup_view(request):
    if request.user.is_authenticated:
        return redirect("core:home")

    if request.method == "POST":
        form = SignUpForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(request, "Tu cuenta fue creada correctamente.")
            return redirect("core:home")
        messages.error(request, "No se pudo crear la cuenta. Revisa el formulario.")
    else:
        form = SignUpForm()

    return render(request, "registration/signup.html", {"form": form})


@login_required
def profile(request):
    summary = build_summary(request.user)
    total_pomodoros = PomodoroSession.objects.filter(user=request.user).count()

    start_date = timezone.localdate() - timedelta(days=6)
    weekly_queryset = (
        PomodoroSession.objects.filter(user=request.user, completed_at__date__gte=start_date)
        .annotate(day=TruncDate("completed_at"))
        .values("day")
        .annotate(total=Count("id"))
        .order_by("day")
    )
    weekly_map = {item["day"]: item["total"] for item in weekly_queryset}

    week_data = []
    for offset in range(7):
        day = start_date + timedelta(days=offset)
        value = weekly_map.get(day, 0)
        week_data.append({"label": day.strftime("%d/%m"), "value": value})

    context = {
        "summary": summary,
        "total_pomodoros": total_pomodoros,
        "recent_completed_tasks": Task.objects.filter(
            user=request.user,
            status=Task.Status.COMPLETED,
        )[:6],
        "week_data": week_data,
        "weekly_max": max((item["value"] for item in week_data), default=1),
    }
    return render(request, "core/profile.html", context)


@login_required
@require_POST
def task_create(request):
    form = TaskForm(request.POST)
    if not form.is_valid():
        return JsonResponse({"errors": serialize_form_errors(form)}, status=400)

    task = form.save(commit=False)
    task.user = request.user
    task.save()

    return JsonResponse(
        {
            "task": serialize_task(task),
            "summary": build_summary(request.user),
        }
    )


@login_required
@require_POST
def task_update(request, task_id):
    task = get_object_or_404(Task, id=task_id, user=request.user)
    form = TaskForm(request.POST, instance=task)
    if not form.is_valid():
        return JsonResponse({"errors": serialize_form_errors(form)}, status=400)

    task = form.save()
    return JsonResponse(
        {
            "task": serialize_task(task),
            "summary": build_summary(request.user),
        }
    )


@login_required
@require_POST
def task_change_status(request, task_id):
    task = get_object_or_404(Task, id=task_id, user=request.user)
    status = request.POST.get("status", "").strip()

    if status not in Task.Status.values:
        return JsonResponse({"errors": {"status": ["Estado invalido."]}}, status=400)

    task.status = status
    task.save(update_fields=["status", "updated_at"])
    return JsonResponse(
        {
            "task": serialize_task(task),
            "summary": build_summary(request.user),
        }
    )


@login_required
@require_POST
def task_delete(request, task_id):
    task = get_object_or_404(Task, id=task_id, user=request.user)
    task.delete()

    return JsonResponse(
        {
            "deleted_id": task_id,
            "summary": build_summary(request.user),
        }
    )


@login_required
@require_POST
def pomodoro_complete(request):
    try:
        duration = int(request.POST.get("duration", "25"))
    except (TypeError, ValueError):
        return JsonResponse({"errors": {"duration": ["Duracion invalida."]}}, status=400)

    if duration < 1 or duration > 120:
        return JsonResponse({"errors": {"duration": ["Duracion fuera de rango."]}}, status=400)

    PomodoroSession.objects.create(user=request.user, duration_minutes=duration)
    summary = build_summary(request.user)
    return JsonResponse({"summary": summary})
