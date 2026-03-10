# OrdenApp

Aplicacion web de productividad con gestion de tareas y temporizador Pomodoro.

## Demo

URL publica: https://ordenapp.onrender.com/

Nota importante: en Render el servicio se suspende tras 15 minutos de inactividad.  
Si entras y esta "dormido", espera unos segundos para que se reactive.

## Funcionalidades

- Registro e inicio de sesion de usuarios
- Crear, editar, completar y eliminar tareas
- Prioridad y tiempo estimado por tarea
- Temporizador Pomodoro (iniciar, pausar, reiniciar)
- Iniciar Pomodoro desde una tarea (boton play)
- Resumen de avance y pomodoros del dia
- Perfil con estadisticas y pomodoros de los ultimos 7 dias
- Modo claro/oscuro

## Stack

- Python 3
- Django
- PostgreSQL (produccion) con neon.tech 
- WhiteNoise para archivos estaticos
- Render para despliegue

## Ejecutar en local

1. Crear/activar entorno virtual
2. Instalar dependencias:

```bash
pip install -r requirements.txt
```

3. Aplicar migraciones:

```bash
python manage.py migrate
```

4. Ejecutar servidor:

```bash
python manage.py runserver
```

## Build en Render

El proyecto usa `build.sh` para:

- instalar dependencias
- correr `collectstatic`
- ejecutar migraciones
