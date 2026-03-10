(() => {
    "use strict";

    const app = document.getElementById("organizador-app");
    if (!app) {
        return;
    }

    const GUEST_TASK_KEY = "organizador_guest_tasks_v3";
    const GUEST_POMODORO_KEY = "organizador_guest_pomodoros_v1";
    const TIMER_STATE_KEY = "ordenapp_timer_state_v1";
    const TIMER_LAST_COMPLETED_KEY = "ordenapp_timer_last_completed_v1";
    const TIMER_SOUND_KEY = "ordenapp_timer_sound_v1";
    const TIMER_TOAST_KEY = "ordenapp_timer_toast_v1";
    const DEFAULT_MINUTES = 15;
    const STATUS_PENDING = "pending";
    const STATUS_COMPLETED = "completed";
    const TIMER_TICK_MS = 1000;

    const isAuthenticated = app.dataset.authenticated === "true";
    const endpoints = {
        create: app.dataset.taskCreateUrl,
        updateTemplate: app.dataset.taskUpdateUrlTemplate,
        deleteTemplate: app.dataset.taskDeleteUrlTemplate,
        statusTemplate: app.dataset.taskStatusUrlTemplate,
        pomodoroComplete: app.dataset.pomodoroCompleteUrl,
    };

    const priorities = parseJsonScript("task-priorities-data", []);
    const minuteOptions = parseJsonScript("minute-options-data", []);
    const initialTasks = parseJsonScript("initial-tasks-data", []);
    const initialSummary = parseJsonScript("initial-summary-data", {});

    const elements = {
        createForm: document.getElementById("task-create-form"),
        createError: document.getElementById("task-form-errors"),
        editForm: document.getElementById("task-edit-form"),
        editError: document.getElementById("task-edit-errors"),
        editTaskId: document.getElementById("edit-task-id"),
        editTitle: document.getElementById("edit-title"),
        editDescription: document.getElementById("edit-description"),
        editEstimatedMinutes: document.getElementById("edit-estimated-minutes"),
        editPriority: document.getElementById("edit-priority"),
        taskList: document.getElementById("task-simple-list"),
        taskEmpty: document.getElementById("task-simple-empty"),
        taskCounterCompleted: document.getElementById("task-counter-completed"),
        taskCounterTotal: document.getElementById("task-counter-total"),
        timerValue: document.getElementById("timer-value"),
        timerProgress: document.getElementById("pomodoro-progress"),
        timerDurationLabel: document.getElementById("pomodoro-duration-label"),
        timerDurationSelect: document.getElementById("pomodoro-duration"),
        startButton: document.getElementById("pomodoro-start"),
        startButtonText: document.getElementById("pomodoro-start-text"),
        startButtonIcon: document.getElementById("pomodoro-start-icon"),
        resetButton: document.getElementById("pomodoro-reset"),
        soundToggle: document.getElementById("pomodoro-sound-toggle"),
        toast: document.getElementById("pomodoro-finish-toast"),
        toastMessage: document.getElementById("pomodoro-toast-message"),
        toastClose: document.getElementById("pomodoro-toast-close"),
        summaryTotal: document.getElementById("summary-total"),
        summaryPending: document.getElementById("summary-pending"),
        summaryCompleted: document.getElementById("summary-completed"),
        summaryProgress: document.getElementById("summary-progress"),
        summaryPomodoros: document.getElementById("summary-pomodoros"),
        summaryProgressBar: document.getElementById("summary-progress-bar"),
    };

    const editModalNode = document.getElementById("taskEditModal");
    const editModal = {
        open() {
            if (!editModalNode) {
                return;
            }
            editModalNode.classList.remove("hidden");
            editModalNode.setAttribute("aria-hidden", "false");
            document.body.classList.add("modal-open");
        },
        close() {
            if (!editModalNode) {
                return;
            }
            editModalNode.classList.add("hidden");
            editModalNode.setAttribute("aria-hidden", "true");
            document.body.classList.remove("modal-open");
        },
    };

    const selectedDuration = normalizeDuration(
        Number(elements.timerDurationSelect?.value || DEFAULT_MINUTES),
    );
    const state = {
        tasks: isAuthenticated ? normalizeTaskList(initialTasks) : loadGuestTasks(),
        summary: isAuthenticated ? initialSummary : {},
        selectedDuration,
        timerDuration: selectedDuration * 60,
        timerRemaining: selectedDuration * 60,
        timerInterval: null,
        timerRunning: false,
        timerEndAt: null,
        timerCompletionToken: null,
        soundEnabled: loadSoundPreference(),
    };

    bindEvents();
    applyCreateDefaults();
    renderSoundToggle();
    restoreCompletionToast();
    const expiredToken = hydrateTimerState();
    renderTimer();
    renderAll();
    if (expiredToken) {
        void finalizeTimerCompletion(expiredToken, true);
    }

    function bindEvents() {
        elements.timerDurationSelect?.addEventListener("change", onDurationChange);
        elements.startButton?.addEventListener("click", toggleTimer);
        elements.resetButton?.addEventListener("click", resetTimer);
        elements.soundToggle?.addEventListener("change", onSoundToggleChange);
        elements.toastClose?.addEventListener("click", hideCompletionToast);
        elements.createForm?.addEventListener("submit", createTask);
        elements.editForm?.addEventListener("submit", submitEditTask);
        app.addEventListener("click", onActionClick);
        editModalNode?.addEventListener("click", onModalClick);
        document.addEventListener("keydown", onGlobalKeydown);
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("focus", onWindowFocus);
        window.addEventListener("beforeunload", persistTimerState);
    }

    function onDurationChange(event) {
        if (state.timerRunning) {
            if (elements.timerDurationSelect) {
                elements.timerDurationSelect.value = String(state.selectedDuration);
            }
            return;
        }

        const minutes = normalizeDuration(Number(event.target.value || DEFAULT_MINUTES));
        state.selectedDuration = minutes;
        state.timerDuration = minutes * 60;
        state.timerRemaining = state.timerDuration;
        state.timerCompletionToken = null;
        persistTimerState();
        renderTimer();
    }

    function onSoundToggleChange(event) {
        state.soundEnabled = Boolean(event.target.checked);
        saveSoundPreference(state.soundEnabled);
    }

    function onVisibilityChange() {
        if (!document.hidden) {
            syncRunningTimer();
        }
    }

    function onWindowFocus() {
        syncRunningTimer();
    }

    function toggleTimer() {
        if (state.timerRunning) {
            pauseTimer();
            return;
        }
        startTimer();
    }

    function startTimer() {
        if (state.timerRunning) {
            return;
        }

        if (state.timerRemaining <= 0) {
            state.timerRemaining = state.timerDuration;
        }

        if (!state.timerCompletionToken || isCompletionHandled(state.timerCompletionToken)) {
            state.timerCompletionToken = generateTimerToken();
        }

        state.timerRunning = true;
        state.timerEndAt = Date.now() + state.timerRemaining * 1000;
        startTimerInterval();
        persistTimerState();
        renderTimer();
    }

    function pauseTimer() {
        if (state.timerRunning) {
            state.timerRemaining = state.timerEndAt
                ? secondsUntil(state.timerEndAt)
                : Math.max(0, state.timerRemaining);
        }

        state.timerRunning = false;
        state.timerEndAt = null;
        stopTimerInterval();
        persistTimerState();
        renderTimer();
    }

    function resetTimer() {
        pauseTimer();
        state.timerRemaining = state.timerDuration;
        state.timerCompletionToken = null;
        hideCompletionToast();
        persistTimerState();
        renderTimer();
    }

    function startTimerInterval() {
        stopTimerInterval();
        state.timerInterval = window.setInterval(syncRunningTimer, TIMER_TICK_MS);
    }

    function stopTimerInterval() {
        if (state.timerInterval) {
            window.clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    }

    function syncRunningTimer() {
        if (!state.timerRunning || !state.timerEndAt) {
            return;
        }

        const remaining = secondsUntil(state.timerEndAt);
        if (remaining <= 0) {
            state.timerRemaining = 0;
            renderTimer();
            void finalizeTimerCompletion(state.timerCompletionToken, false);
            return;
        }

        state.timerRemaining = remaining;
        renderTimer();
    }

    async function finalizeTimerCompletion(token, restored) {
        const completionToken = token || state.timerCompletionToken || generateTimerToken();
        if (isCompletionHandled(completionToken)) {
            finishTimerCleanup();
            return;
        }

        markCompletionHandled(completionToken);
        finishTimerCleanup();
        await completePomodoro();
        showCompletionToast(
            restored
                ? "La sesion finalizo mientras estabas fuera."
                : "Sesion completada. Pomodoro registrado.",
        );
        playCompletionSound();
    }

    function finishTimerCleanup() {
        state.timerRunning = false;
        state.timerRemaining = 0;
        state.timerEndAt = null;
        state.timerCompletionToken = null;
        stopTimerInterval();
        persistTimerState();
        renderTimer();
    }

    async function completePomodoro() {
        if (isAuthenticated) {
            const payload = new FormData();
            payload.append("duration", String(state.selectedDuration));
            try {
                const response = await postForm(endpoints.pomodoroComplete, payload);
                applySummary(response.summary);
            } catch (_error) {
                // Keep UX fluent if endpoint fails.
            }
        } else {
            incrementGuestPomodoroCount();
        }
        updateSummary();
    }

    async function createTask(event) {
        event.preventDefault();
        showErrors(elements.createError, null);

        const formData = new FormData(elements.createForm);
        const payload = payloadFromFormData(formData);
        if (!payload.title) {
            showErrors(elements.createError, ["El titulo es obligatorio."]);
            return;
        }

        try {
            if (isAuthenticated) {
                const response = await postForm(endpoints.create, formData);
                state.tasks.unshift(normalizeTask(response.task));
                applySummary(response.summary);
            } else {
                state.tasks.unshift(
                    normalizeTask({
                        id: generateGuestId(),
                        title: payload.title,
                        description: payload.description,
                        estimated_minutes: payload.estimated_minutes,
                        priority: payload.priority,
                        status: STATUS_PENDING,
                    }),
                );
                saveGuestTasks(state.tasks);
            }

            elements.createForm.reset();
            applyCreateDefaults();
            renderAll();
        } catch (error) {
            showErrors(elements.createError, error);
        }
    }

    async function submitEditTask(event) {
        event.preventDefault();
        showErrors(elements.editError, null);

        const taskId = String(elements.editTaskId?.value || "");
        if (!taskId) {
            showErrors(elements.editError, ["No se encontro la tarea."]);
            return;
        }

        const formData = new FormData(elements.editForm);
        const payload = payloadFromFormData(formData);
        if (!payload.title) {
            showErrors(elements.editError, ["El titulo es obligatorio."]);
            return;
        }

        try {
            if (isAuthenticated) {
                const url = buildEndpoint(endpoints.updateTemplate, taskId);
                const response = await postForm(url, formData);
                replaceTask(response.task);
                applySummary(response.summary);
            } else {
                const existingTask = findTaskById(taskId);
                if (!existingTask) {
                    throw ["No se encontro la tarea."];
                }
                replaceTask({
                    ...existingTask,
                    title: payload.title,
                    description: payload.description,
                    estimated_minutes: payload.estimated_minutes,
                    priority: payload.priority,
                });
                saveGuestTasks(state.tasks);
            }

            editModal.close();
            renderAll();
        } catch (error) {
            showErrors(elements.editError, error);
        }
    }

    async function onActionClick(event) {
        const actionNode = event.target.closest("[data-task-action]");
        if (!actionNode) {
            return;
        }

        const action = actionNode.dataset.taskAction;
        const taskId = actionNode.dataset.taskId;
        if (!taskId) {
            return;
        }

        if (action === "toggle-complete") {
            const task = findTaskById(taskId);
            if (!task) {
                return;
            }
            const nextStatus = isTaskCompleted(task) ? STATUS_PENDING : STATUS_COMPLETED;
            await changeTaskStatus(taskId, nextStatus);
            return;
        }

        if (action === "play") {
            const task = findTaskById(taskId);
            if (!task || isTaskCompleted(task)) {
                return;
            }
            startTimerForTask(task);
            return;
        }

        if (action === "edit") {
            openEditModal(taskId);
            return;
        }

        if (action === "delete") {
            if (!window.confirm("Eliminar esta tarea?")) {
                return;
            }
            await deleteTask(taskId);
        }
    }

    function openEditModal(taskId) {
        const task = findTaskById(taskId);
        if (!task || !elements.editForm) {
            return;
        }

        elements.editTaskId.value = String(task.id);
        elements.editTitle.value = task.title || "";
        elements.editDescription.value = task.description || "";
        elements.editEstimatedMinutes.value = String(task.estimated_minutes || DEFAULT_MINUTES);
        elements.editPriority.value = task.priority || "";
        showErrors(elements.editError, null);
        editModal.open();
    }

    function onModalClick(event) {
        if (!editModalNode) {
            return;
        }
        if (event.target === editModalNode) {
            editModal.close();
            return;
        }
        const closeNode = event.target.closest("[data-modal-close]");
        if (closeNode) {
            editModal.close();
        }
    }

    function onGlobalKeydown(event) {
        if (event.key === "Escape" && editModalNode && !editModalNode.classList.contains("hidden")) {
            editModal.close();
        }
    }

    async function changeTaskStatus(taskId, status) {
        try {
            if (isAuthenticated) {
                const payload = new FormData();
                payload.append("status", status);
                const response = await postForm(
                    buildEndpoint(endpoints.statusTemplate, taskId),
                    payload,
                );
                replaceTask(response.task);
                applySummary(response.summary);
            } else {
                const task = findTaskById(taskId);
                if (!task) {
                    return;
                }
                replaceTask({ ...task, status });
                saveGuestTasks(state.tasks);
            }
            renderAll();
        } catch (_error) {
            renderAll();
        }
    }

    async function deleteTask(taskId) {
        try {
            if (isAuthenticated) {
                await postForm(buildEndpoint(endpoints.deleteTemplate, taskId), new FormData());
            }
            state.tasks = state.tasks.filter((item) => String(item.id) !== String(taskId));
            if (!isAuthenticated) {
                saveGuestTasks(state.tasks);
            }
            renderAll();
        } catch (_error) {
            renderAll();
        }
    }

    function renderAll() {
        renderTaskList();
        updateSummary();
    }

    function renderTaskList() {
        if (!elements.taskList) {
            return;
        }

        const orderedTasks = [...state.tasks].sort((a, b) => {
            if (a.status === b.status) {
                return 0;
            }
            return isTaskCompleted(a) ? 1 : -1;
        });

        elements.taskList.innerHTML = "";
        for (const task of orderedTasks) {
            elements.taskList.appendChild(buildTaskRow(task));
        }

        const stats = getTaskStats(state.tasks);
        setText(elements.taskCounterTotal, stats.total);
        setText(elements.taskCounterCompleted, stats.completed);

        if (elements.taskEmpty) {
            elements.taskEmpty.classList.toggle("d-none", stats.total > 0);
        }
    }

    function buildTaskRow(task) {
        const article = document.createElement("article");
        const completed = isTaskCompleted(task);
        article.className = `task-simple-item${completed ? " completed" : ""}`;

        const priorityLabel = task.priority ? findLabel(priorities, task.priority) : "";
        const priorityClass = task.priority ? `priority-${task.priority}` : "";
        const minuteLabel = findMinuteLabel(task.estimated_minutes);
        const description = task.description ? escapeHtml(task.description) : "Sin descripcion.";

        article.innerHTML = `
            <button type="button" class="task-check-btn${completed ? " is-checked" : ""}" data-task-action="toggle-complete" data-task-id="${escapeHtml(task.id)}" aria-label="Completar tarea">${completed ? "&#10003;" : ""}</button>
            <div class="task-simple-content">
                <h3 class="task-simple-title${completed ? " is-done" : ""}">${escapeHtml(task.title)}</h3>
                <p class="task-simple-desc${completed ? " is-done" : ""}">${description}</p>
                <p class="task-simple-time mb-0">${escapeHtml(minuteLabel)}</p>
            </div>
            <div class="task-simple-right">
                ${priorityLabel ? `<span class="badge badge-priority ${priorityClass}">${escapeHtml(priorityLabel)}</span>` : ""}
                ${
                    !completed
                        ? `<button type="button" class="icon-action-btn play" data-task-action="play" data-task-id="${escapeHtml(task.id)}" aria-label="Iniciar temporizador de tarea" title="Iniciar temporizador">
                            <span class="play-glyph" aria-hidden="true">&#9654;</span>
                        </button>`
                        : ""
                }
                <button type="button" class="icon-action-btn" data-task-action="edit" data-task-id="${escapeHtml(task.id)}" aria-label="Editar tarea">
                    ${editIconSvg()}
                </button>
                <button type="button" class="icon-action-btn danger" data-task-action="delete" data-task-id="${escapeHtml(task.id)}" aria-label="Eliminar tarea">
                    ${trashIconSvg()}
                </button>
            </div>
        `;

        return article;
    }

    function updateSummary() {
        const stats = getTaskStats(state.tasks);
        const pomodoros = isAuthenticated
            ? Number(state.summary.pomodoros_today || 0)
            : Number(loadGuestPomodoroState().count || 0);

        setText(elements.summaryTotal, stats.total);
        setText(elements.summaryPending, stats.pending);
        setText(elements.summaryCompleted, stats.completed);
        setText(elements.summaryProgress, `${stats.progress}%`);
        setText(elements.summaryPomodoros, pomodoros);

        if (elements.summaryProgressBar) {
            elements.summaryProgressBar.style.width = `${stats.progress}%`;
            elements.summaryProgressBar.setAttribute("aria-valuenow", String(stats.progress));
        }
    }

    function renderTimer() {
        elements.timerValue && (elements.timerValue.textContent = formatSeconds(state.timerRemaining));
        elements.timerDurationLabel && (elements.timerDurationLabel.textContent = `${state.selectedDuration} minutos`);
        if (elements.timerProgress) {
            const elapsed = state.timerDuration - state.timerRemaining;
            const ratio = state.timerDuration ? (elapsed / state.timerDuration) * 100 : 0;
            elements.timerProgress.style.width = `${Math.min(100, Math.max(0, ratio))}%`;
        }
        updateStartButton();
    }

    function renderSoundToggle() {
        if (elements.soundToggle) {
            elements.soundToggle.checked = Boolean(state.soundEnabled);
        }
    }

    function startTimerForTask(task) {
        const minutes = findAvailableDuration(task.estimated_minutes);
        pauseTimer();
        state.selectedDuration = minutes;
        state.timerDuration = minutes * 60;
        state.timerRemaining = state.timerDuration;
        state.timerCompletionToken = null;
        if (elements.timerDurationSelect) {
            elements.timerDurationSelect.value = String(minutes);
        }
        persistTimerState();
        renderTimer();
        startTimer();
    }

    function updateStartButton() {
        elements.startButtonText && (elements.startButtonText.textContent = state.timerRunning ? "Pausar" : "Iniciar");
        elements.startButtonIcon && (elements.startButtonIcon.textContent = state.timerRunning ? "||" : ">");
    }

    function applyCreateDefaults() {
        const minutesInput = elements.createForm?.querySelector('[name="estimated_minutes"]');
        const priorityInput = elements.createForm?.querySelector('[name="priority"]');

        if (minutesInput) {
            minutesInput.value = String(DEFAULT_MINUTES);
        }
        if (priorityInput) {
            priorityInput.value = "";
        }
    }

    function hydrateTimerState() {
        const snapshot = loadTimerState();
        if (!snapshot) {
            persistTimerState();
            return null;
        }

        state.selectedDuration = normalizeDuration(snapshot.selectedDuration);
        state.timerDuration = normalizeSeconds(snapshot.timerDuration, state.selectedDuration * 60);
        state.timerRemaining = normalizeSeconds(snapshot.timerRemaining, state.timerDuration);
        state.timerRunning = Boolean(snapshot.timerRunning);
        state.timerEndAt = state.timerRunning ? Number(snapshot.timerEndAt || 0) : null;
        state.timerCompletionToken = snapshot.timerCompletionToken || null;

        if (elements.timerDurationSelect) {
            elements.timerDurationSelect.value = String(state.selectedDuration);
        }

        if (state.timerRunning && state.timerEndAt) {
            const remaining = secondsUntil(state.timerEndAt);
            if (remaining <= 0) {
                const expiredToken = state.timerCompletionToken || generateTimerToken();
                state.timerRunning = false;
                state.timerRemaining = 0;
                state.timerEndAt = null;
                state.timerCompletionToken = null;
                stopTimerInterval();
                persistTimerState();
                return expiredToken;
            }
            state.timerRemaining = remaining;
            startTimerInterval();
            persistTimerState();
            return null;
        }

        state.timerRunning = false;
        state.timerEndAt = null;
        stopTimerInterval();
        persistTimerState();
        return null;
    }

    function persistTimerState() {
        const remaining = state.timerRunning && state.timerEndAt
            ? secondsUntil(state.timerEndAt)
            : Math.max(0, Math.round(state.timerRemaining));

        const payload = {
            selectedDuration: state.selectedDuration,
            timerDuration: state.timerDuration,
            timerRemaining: remaining,
            timerRunning: state.timerRunning,
            timerEndAt: state.timerRunning ? state.timerEndAt : null,
            timerCompletionToken: state.timerCompletionToken,
        };

        try {
            window.localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(payload));
        } catch (_error) {
            // Ignore storage errors.
        }
    }

    function loadTimerState() {
        try {
            const raw = window.localStorage.getItem(TIMER_STATE_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") {
                return null;
            }
            return parsed;
        } catch (_error) {
            return null;
        }
    }

    function isCompletionHandled(token) {
        if (!token) {
            return false;
        }
        try {
            return window.localStorage.getItem(TIMER_LAST_COMPLETED_KEY) === token;
        } catch (_error) {
            return false;
        }
    }

    function markCompletionHandled(token) {
        if (!token) {
            return;
        }
        try {
            window.localStorage.setItem(TIMER_LAST_COMPLETED_KEY, token);
        } catch (_error) {
            // Ignore storage errors.
        }
    }

    function showCompletionToast(message) {
        if (!elements.toast) {
            return;
        }

        if (elements.toastMessage) {
            elements.toastMessage.textContent = message;
        }
        elements.toast.classList.remove("hidden");
        saveCompletionToastMessage(message);
    }

    function hideCompletionToast() {
        if (!elements.toast) {
            return;
        }
        elements.toast.classList.add("hidden");
        clearCompletionToastMessage();
    }

    function restoreCompletionToast() {
        if (!elements.toast) {
            return;
        }
        const message = loadCompletionToastMessage();
        if (!message) {
            return;
        }
        if (elements.toastMessage) {
            elements.toastMessage.textContent = message;
        }
        elements.toast.classList.remove("hidden");
    }

    function loadCompletionToastMessage() {
        try {
            return window.localStorage.getItem(TIMER_TOAST_KEY) || "";
        } catch (_error) {
            return "";
        }
    }

    function saveCompletionToastMessage(message) {
        try {
            window.localStorage.setItem(TIMER_TOAST_KEY, String(message || ""));
        } catch (_error) {
            // Ignore storage errors.
        }
    }

    function clearCompletionToastMessage() {
        try {
            window.localStorage.removeItem(TIMER_TOAST_KEY);
        } catch (_error) {
            // Ignore storage errors.
        }
    }

    function playCompletionSound() {
        if (!state.soundEnabled) {
            return;
        }

        try {
            const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextCtor) {
                return;
            }

            const context = new AudioContextCtor();
            const notes = [880, 660, 990];
            const noteLength = 0.14;
            const noteGap = 0.17;
            const startAt = context.currentTime;

            for (let index = 0; index < notes.length; index += 1) {
                const oscillator = context.createOscillator();
                const gain = context.createGain();
                const noteStart = startAt + index * noteGap;
                const noteEnd = noteStart + noteLength;

                oscillator.type = "sine";
                oscillator.frequency.value = notes[index];
                gain.gain.setValueAtTime(0.0001, noteStart);
                gain.gain.exponentialRampToValueAtTime(0.17, noteStart + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

                oscillator.connect(gain);
                gain.connect(context.destination);
                oscillator.start(noteStart);
                oscillator.stop(noteEnd + 0.03);
            }

            window.setTimeout(() => {
                void context.close();
            }, 900);
        } catch (_error) {
            // Ignore audio errors.
        }
    }

    function loadSoundPreference() {
        try {
            return window.localStorage.getItem(TIMER_SOUND_KEY) === "1";
        } catch (_error) {
            return false;
        }
    }

    function saveSoundPreference(enabled) {
        try {
            window.localStorage.setItem(TIMER_SOUND_KEY, enabled ? "1" : "0");
        } catch (_error) {
            // Ignore storage errors.
        }
    }

    function payloadFromFormData(formData) {
        return {
            title: (formData.get("title") || "").toString().trim(),
            description: (formData.get("description") || "").toString().trim(),
            estimated_minutes: Number(formData.get("estimated_minutes") || DEFAULT_MINUTES),
            priority: (formData.get("priority") || "").toString(),
        };
    }

    function replaceTask(taskData) {
        const normalized = normalizeTask(taskData);
        state.tasks = state.tasks.map((task) =>
            String(task.id) === String(normalized.id) ? normalized : task,
        );
    }

    function normalizeTaskList(tasks) {
        return (tasks || []).map((task) => normalizeTask(task));
    }

    function normalizeTask(task) {
        return {
            id: task.id,
            title: (task.title || "").toString(),
            description: (task.description || "").toString(),
            estimated_minutes: Number(task.estimated_minutes || DEFAULT_MINUTES),
            priority: (task.priority || "").toString(),
            status: (task.status || STATUS_PENDING).toString(),
        };
    }

    function findMinuteLabel(value) {
        const minutes = Number(value || DEFAULT_MINUTES);
        const option = minuteOptions.find((item) => Number(item.value) === minutes);
        return option ? option.label : `${minutes} minutos`;
    }

    function findAvailableDuration(value) {
        const minutes = Number(value || DEFAULT_MINUTES);
        const exists = minuteOptions.some((item) => Number(item.value) === minutes);
        return exists ? minutes : DEFAULT_MINUTES;
    }

    function normalizeDuration(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return DEFAULT_MINUTES;
        }
        return findAvailableDuration(numeric);
    }

    function normalizeSeconds(value, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) {
            return Math.max(0, Math.round(fallback));
        }
        return Math.round(numeric);
    }

    function secondsUntil(endAt) {
        return Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    }

    function loadGuestTasks() {
        try {
            const raw = window.localStorage.getItem(GUEST_TASK_KEY);
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return normalizeTaskList(parsed);
        } catch (_error) {
            return [];
        }
    }

    function saveGuestTasks(tasks) {
        try {
            window.localStorage.setItem(GUEST_TASK_KEY, JSON.stringify(tasks));
        } catch (_error) {
            // Ignore storage errors.
        }
    }

    function loadGuestPomodoroState() {
        const today = currentDateKey();
        try {
            const raw = window.localStorage.getItem(GUEST_POMODORO_KEY);
            if (!raw) {
                return { date: today, count: 0 };
            }
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.date !== today) {
                return { date: today, count: 0 };
            }
            return { date: today, count: Number(parsed.count || 0) };
        } catch (_error) {
            return { date: today, count: 0 };
        }
    }

    function incrementGuestPomodoroCount() {
        const current = loadGuestPomodoroState();
        const next = { date: currentDateKey(), count: current.count + 1 };
        try {
            window.localStorage.setItem(GUEST_POMODORO_KEY, JSON.stringify(next));
        } catch (_error) {
            // Ignore storage errors.
        }
    }

    async function postForm(url, formData) {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "X-CSRFToken": getCookie("csrftoken"),
                "X-Requested-With": "XMLHttpRequest",
            },
            body: formData,
            credentials: "same-origin",
        });

        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json") ? await response.json() : {};

        if (response.redirected && !contentType.includes("application/json")) {
            throw ["Tu sesion expiro. Recarga la pagina e inicia sesion."];
        }
        if (!response.ok) {
            throw payload.errors || ["No se pudo completar la operacion."];
        }
        return payload;
    }

    function buildEndpoint(template, taskId) {
        return template.replace("/0/", `/${taskId}/`);
    }

    function applySummary(summary) {
        if (summary && typeof summary === "object") {
            state.summary = summary;
        }
    }

    function findTaskById(taskId) {
        return state.tasks.find((task) => String(task.id) === String(taskId));
    }

    function isTaskCompleted(task) {
        return String(task?.status || "") === STATUS_COMPLETED;
    }

    function getTaskStats(tasks) {
        const total = tasks.length;
        const completed = tasks.filter((task) => isTaskCompleted(task)).length;
        const pending = total - completed;
        const progress = total ? Math.round((completed / total) * 100) : 0;
        return { total, completed, pending, progress };
    }

    function setText(node, value) {
        if (node) {
            node.textContent = String(value);
        }
    }

    function showErrors(container, errors) {
        if (!container) {
            return;
        }
        if (!errors) {
            container.classList.add("d-none");
            container.textContent = "";
            return;
        }

        const lines = [];
        if (typeof errors === "string") {
            lines.push(errors);
        } else if (Array.isArray(errors)) {
            lines.push(...errors.map((error) => String(error)));
        } else {
            for (const value of Object.values(errors)) {
                if (Array.isArray(value)) {
                    lines.push(...value.map((error) => String(error)));
                } else {
                    lines.push(String(value));
                }
            }
        }

        container.innerHTML = lines.map((line) => escapeHtml(line)).join("<br>");
        container.classList.remove("d-none");
    }

    function parseJsonScript(id, fallback) {
        const node = document.getElementById(id);
        if (!node) {
            return fallback;
        }
        try {
            return JSON.parse(node.textContent);
        } catch (_error) {
            return fallback;
        }
    }

    function findLabel(options, value) {
        const match = options.find((item) => item.value === value);
        return match ? match.label : "";
    }

    function formatSeconds(totalSeconds) {
        const safe = Math.max(0, Number(totalSeconds || 0));
        const minutes = Math.floor(safe / 60);
        const seconds = safe % 60;
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    function currentDateKey() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }

    function generateGuestId() {
        return `g-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    }

    function generateTimerToken() {
        return `tm-${Date.now()}-${Math.floor(Math.random() * 999999)}`;
    }

    function editIconSvg() {
        return `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 20h4l10.2-10.2a1.7 1.7 0 0 0 0-2.4l-1.6-1.6a1.7 1.7 0 0 0-2.4 0L4 16v4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path>
                <path d="m12.5 7.5 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
            </svg>
        `;
    }

    function trashIconSvg() {
        return `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4.5 7h15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
                <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" stroke="currentColor" stroke-width="1.7"></path>
                <path d="M7 7l1 12h8l1-12" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path>
                <path d="M10 11v5M14 11v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
            </svg>
        `;
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function getCookie(name) {
        const cookie = document.cookie
            .split(";")
            .map((part) => part.trim())
            .find((part) => part.startsWith(`${name}=`));
        return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
    }
})();
