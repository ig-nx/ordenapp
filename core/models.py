from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()


class Task(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pendiente"
        COMPLETED = "completed", "Terminada"

    class Priority(models.TextChoices):
        NONE = "", "Sin prioridad"
        LOW = "low", "Baja"
        MEDIUM = "medium", "Media"
        HIGH = "high", "Alta"

    ESTIMATED_MINUTES_CHOICES = (
        (5, "5 minutos"),
        (10, "10 minutos"),
        (15, "15 minutos"),
        (30, "30 minutos"),
        (45, "45 minutos"),
        (60, "60 minutos"),
    )

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="tasks",
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=140)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    estimated_minutes = models.PositiveSmallIntegerField(
        choices=ESTIMATED_MINUTES_CHOICES,
        default=15,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        blank=True,
        default=Priority.NONE,
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class PomodoroSession(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="pomodoro_sessions",
    )
    duration_minutes = models.PositiveSmallIntegerField(default=25)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-completed_at"]

    def __str__(self):
        return f"{self.user} - {self.duration_minutes} min"
