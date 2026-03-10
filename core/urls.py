from django.contrib.auth import views as auth_views
from django.urls import path

from . import views

app_name = "core"

urlpatterns = [
    path("", views.home, name="home"),
    path("perfil/", views.profile, name="profile"),
    path("registro/", views.signup_view, name="signup"),
    path(
        "login/",
        auth_views.LoginView.as_view(
            template_name="registration/login.html",
            redirect_authenticated_user=True,
        ),
        name="login",
    ),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("api/tasks/create/", views.task_create, name="task_create"),
    path("api/tasks/<int:task_id>/update/", views.task_update, name="task_update"),
    path("api/tasks/<int:task_id>/delete/", views.task_delete, name="task_delete"),
    path(
        "api/tasks/<int:task_id>/status/",
        views.task_change_status,
        name="task_change_status",
    ),
    path("api/pomodoro/complete/", views.pomodoro_complete, name="pomodoro_complete"),
]
