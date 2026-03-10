from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User

from .models import Task


class SignUpForm(UserCreationForm):
    email = forms.EmailField(required=False)

    class Meta:
        model = User
        fields = ("username", "email", "password1", "password2")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs["class"] = "form-control auth-input"


class TaskForm(forms.ModelForm):
    class Meta:
        model = Task
        fields = [
            "title",
            "description",
            "estimated_minutes",
            "priority",
        ]
        widgets = {
            "title": forms.TextInput(
                attrs={"maxlength": 140, "placeholder": "Titulo de la tarea"}
            ),
            "description": forms.Textarea(
                attrs={"rows": 2, "placeholder": "Descripcion opcional"}
            ),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        css_map = {
            "title": "form-control",
            "description": "form-control",
            "estimated_minutes": "form-select",
            "priority": "form-select",
        }
        for field_name, css_class in css_map.items():
            self.fields[field_name].widget.attrs["class"] = css_class
