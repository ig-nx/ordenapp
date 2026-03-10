from django.contrib import admin

from .models import PomodoroSession, Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "user",
        "status",
        "estimated_minutes",
        "priority",
        "created_at",
    )
    list_filter = ("status", "priority", "created_at")
    search_fields = ("title", "description", "user__username")


@admin.register(PomodoroSession)
class PomodoroSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "duration_minutes", "completed_at")
    list_filter = ("duration_minutes", "completed_at")
    search_fields = ("user__username",)
