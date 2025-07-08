document.addEventListener('DOMContentLoaded', () => {
    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ ---
    let appDB = { activeReportId: null, reports: {}, employees: [] }; 
    let isEditMode = false;

    // --- DOM ЭЛЕМЕНТЫ ---
    const elements = {
        loadingOverlay: document.getElementById('loading-overlay'),
        editToggle: document.getElementById('edit-mode-toggle'),
        saveBtn: document.getElementById('save-btn'),
        finishReportBtn: document.getElementById('finish-report-btn'),
        downloadBtn: document.getElementById('download-btn'),
        openDbModalBtn: document.getElementById('open-db-modal-btn'),
        closeModalBtn: document.getElementById('close-modal-btn'),
        dbModal: document.getElementById('db-modal'),
        dbModalContent: document.getElementById('db-modal-content'),
        createNewReportBtn: document.getElementById('create-new-report-btn'),
        fileInput: document.getElementById('file-input'),
        appContent: document.getElementById('app-content'),
        navLinks: document.querySelectorAll('.nav-link'),
    };
    
    // Прячем старые кнопки импорта/экспорта БД
    const importBtn = document.getElementById('import-db-btn');
    const exportBtn = document.getElementById('export-db-btn');
    if(importBtn) importBtn.style.display = 'none';
    if(exportBtn) exportBtn.style.display = 'none';

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
    const toISODateString = (date) => new Date(date).toISOString().split('T')[0];
    const toISODateTimeString = (dateStr) => dateStr ? new Date(dateStr).toISOString().slice(0, 16) : '';
    const formatDate = (isoString) => isoString ? new Date(isoString).toLocaleDateString('ru-RU') : '';
    const formatDateTime = (isoString) => isoString ? new Date(isoString).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'не указано';
    const calculateDuration = (start, end) => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (isNaN(startDate) || isNaN(endDate) || endDate < startDate) return "Ошибка дат";
        let diff = Math.abs(endDate - startDate) / 1000 / 60;
        const days = Math.floor(diff / (24 * 60)); diff %= (24*60);
        const hours = Math.floor(diff / 60); const minutes = Math.round(diff % 60);
        let result = [];
        if (days > 0) result.push(`${days} д`); if (hours > 0) result.push(`${hours} ч`);
        if (minutes > 0 || (days === 0 && hours === 0)) result.push(`${minutes} мин`);
        return result.length > 0 ? result.join(' ') : '0 мин';
    };
    const createIcon = (path, classes = "h-5 w-5") => `<svg class="${classes}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="${path}" clip-rule="evenodd" /></svg>`;
    const ICONS = {
        TRASH: createIcon('M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z', 'h-4 w-4'),
        PLUS: createIcon('M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z', 'h-5 w-5 mr-1'),
        USER_PLUS: createIcon('M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z', 'h-5 w-5'),
    };
    function showToast(message, duration = 3000) {
        const toast = document.createElement('div');
        toast.className = 'toast'; toast.textContent = message;
        document.getElementById('toast-container').appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => { toast.classList.remove('show'); toast.addEventListener('transitionend', () => toast.remove()); }, duration);
    }
    
    // --- API МОДУЛЬ ---
    const API = {
        request: async (url, options = {}) => {
            try {
                const response = await fetch(url, {
                    headers: {'Content-Type': 'application/json'},
                    ...options
                });
                if (response.status === 401) { window.location.href = '/login'; return; }
                if (!response.ok) { const err = await response.json(); throw new Error(err.message || 'Ошибка сервера');}
                return response.json();
            } catch (error) { console.error('API Error:', error); showToast(`Ошибка API: ${error.message}`); throw error; }
        },
        loadDB: () => API.request('/api/database'),

        // ИЗМЕНЕНО: Новая, упрощенная логика создания отчета
        createReport: () => {
            const today = new Date();
            const firstUser = appDB.employees.length > 0 ? appDB.employees[0].fullName : "Имя Фамилия, Должность";
            const defaultData = {
                author: firstUser, 
                date: toISODateString(today),
                status: "В работе",
                startTime: toISODateTimeString(new Date(new Date().setHours(18,0,0,0))), 
                endTime: toISODateTimeString(new Date(new Date().setHours(19,0,0,0))),
                systems: ["Основной веб-сервер"],
                executors: [firstUser],
                reason: { type: "Плановое обслуживание", description: "" },
                goals: ["Выполнить задачу..."],
                log: [{ time: toISODateTimeString(new Date(new Date().setHours(18,0,0,0))), action: "Начало работ." }],
                results: { goalsConfirmation: [], problems: "", rollback: "" },
                impact: { description: "Краткосрочная недоступность сервиса.", actions: [], improvements: "" }
            };

            // Просто отправляем POST-запрос с данными, бэкенд сделает остальное
            return API.request('/api/reports', {
                method: 'POST',
                body: JSON.stringify(defaultData)
            }).then(res => {
                // Добавляем полученный от сервера отчет в наш локальный стейт
                appDB.reports[res.id] = res.report;
                return res.id; // Возвращаем ID нового отчета
            });
        },
        updateReport: (id, payload) => API.request(`/api/reports/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
        deleteReport: (id) => API.request(`/api/reports/${id}`, { method: 'DELETE' }),
        createEmployee: (name, title) => API.request('/api/employees', { method: 'POST', body: JSON.stringify({ name, title }) }),
        deleteEmployee: (id) => API.request(`/api/employees/${id}`, { method: 'DELETE' }),
    };
    
    // --- ГЛОБАЛЬНАЯ ЛОГИКА ---
    const DB = {
        load: async () => {
            const data = await API.loadDB();
            appDB = data;
            if (!appDB.employees) appDB.employees = []; 
            if (!appDB.activeReportId || !appDB.reports[appDB.activeReportId]) {
                const reportIds = Object.keys(appDB.reports);
                appDB.activeReportId = reportIds.length > 0 ? reportIds[0] : null;
            }
        },
        getActiveReport: () => appDB.activeReportId ? appDB.reports[appDB.activeReportId] : null,
    };

    // БЛОК ФУНКЦИЙ РЕНДЕРИНГА ОСТАЕТСЯ БЕЗ ИЗМЕНЕНИЙ, КОПИРУЮ ЕГО ДЛЯ ПОЛНОТЫ ФАЙЛА
    function renderApp() { const currentReport = DB.getActiveReport(); if (!currentReport) { elements.appContent.innerHTML = `<div id="overview" class="content-section active"></div><div id="details" class="content-section"></div><div id="results" class="content-section"></div><div id="impact" class="content-section"></div><div id="menu" class="content-section"></div>`; document.querySelector('#overview').innerHTML = `<div class="text-center p-10 bg-white rounded-lg shadow-sm"><h2 class="text-2xl font-bold mb-4">Нет активных отчетов</h2><p>Создайте новый отчет в Архиве или откройте Меню для настройки сотрудников.</p></div>`; document.getElementById('report-title').textContent = "Нет отчета"; document.getElementById('report-meta').textContent = "Пожалуйста, выберите или создайте отчет"; elements.finishReportBtn.classList.add('hidden'); renderMenu(); elements.loadingOverlay.classList.add('hidden'); return; } const data = currentReport.data; renderHeader(currentReport); renderOverview(data);  renderDetails(data);  renderResults(data.results);  renderImpact(data.impact); renderMenu(); elements.editToggle.disabled = currentReport.isFinished; elements.finishReportBtn.classList.remove('hidden'); elements.loadingOverlay.classList.add('hidden'); }
    function renderHeader(report) { if(!report || !report.data) return; const {data, isFinished} = report; const canEdit = isEditMode && !isFinished; const renderAuthorSelect = (currentAuthor) => { let options = appDB.employees.map(e => `<option value="${e.fullName}" ${e.fullName === currentAuthor ? 'selected' : ''}>${e.fullName}</option>`).join(''); if (!appDB.employees.some(e => e.fullName === currentAuthor)) { options += `<option value="${currentAuthor}" selected>${currentAuthor} (вручную)</option>`; } return `<select data-field="author" class="editable-select inline-block w-72">${options}</select>`; }; document.getElementById('report-title').innerHTML = canEdit ? `<input data-field="id" class="editable-input text-3xl font-bold" value="${data.id || ''}">` : `${data.id}`; document.getElementById('report-meta').innerHTML = canEdit ? `Составлен: ${renderAuthorSelect(data.author)} | Дата: <input data-field="date" type="date" class="editable-input inline-block w-40" value="${data.date ? toISODateString(data.date) : ''}">` : `Составлен: ${data.author} | Дата: ${formatDate(data.date)}`; let statusHtml; if(isFinished){ statusHtml = `<span class="status-badge status-success">ЗАВЕРШЕН</span>`; elements.finishReportBtn.textContent = 'Возобновить работу'; elements.finishReportBtn.classList.replace('bg-purple-600', 'bg-yellow-500'); elements.finishReportBtn.classList.replace('hover:bg-purple-700', 'hover:bg-yellow-600'); } else { statusHtml = `<span class="status-badge status-partial">В РАБОТЕ</span>`; elements.finishReportBtn.textContent = 'Завершить отчет'; elements.finishReportBtn.classList.replace('bg-yellow-500', 'bg-purple-600'); elements.finishReportBtn.classList.replace('hover:bg-yellow-600', 'hover:bg-purple-700'); } document.getElementById('report-status-container').innerHTML = statusHtml; }
    function renderOverview({status, startTime, endTime, systems, executors}) { const currentReport = DB.getActiveReport(); if (!currentReport) return; const canEdit = isEditMode && !currentReport.isFinished; let statusClass; switch(status) { case "Частично успешно": statusClass = 'status-partial'; break; case "Неуспешно": statusClass = 'status-fail'; break; default: statusClass = 'status-success'; } document.getElementById('overview').innerHTML = `<div class="grid grid-cols-1 md:grid-cols-3 gap-6"><div class="bg-white p-6 rounded-xl shadow-sm"><h3 class="font-semibold text-stone-500 mb-2">Итог работ</h3>${canEdit ? `<select data-field="status" class="editable-select">${['Успешно', 'Частично успешно', 'Неуспешно'].map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>` : `<div id="overview-status"><span class="status-badge ${statusClass}">${status}</span></div>`}</div><div class="bg-white p-6 rounded-xl shadow-sm"><h3 class="font-semibold text-stone-500 mb-2">Общая продолжительность</h3><p class="text-3xl font-bold">${calculateDuration(startTime, endTime)}</p></div><div class="bg-white p-6 rounded-xl shadow-sm"><h3 class="font-semibold text-stone-500 mb-2">Исполнители</h3><div class="list-container" data-list-key="executors">${renderList(executors, 'executors')}</div></div></div><div class="mt-6 bg-white p-6 rounded-xl shadow-sm"><h3 class="font-semibold text-stone-500 mb-3">Временные рамки</h3><div class="space-y-2"><p><span class="font-semibold">Начало:</span> ${canEdit ? `<input data-field="startTime" type="datetime-local" class="editable-input" value="${toISODateTimeString(startTime)}">` : formatDateTime(startTime)}</p><div class="w-full bg-stone-200 rounded-full h-2.5 my-2"><div class="bg-blue-600 h-2.5 rounded-full" style="width: 100%"></div></div><p><span class="font-semibold">Окончание:</span> ${canEdit ? `<input data-field="endTime" type="datetime-local" class="editable-input" value="${toISODateTimeString(endTime)}">` : formatDateTime(endTime)}</p></div></div><div class="mt-6 bg-white p-6 rounded-xl shadow-sm"><h3 class="font-semibold text-stone-500 mb-2">Затронутые системы</h3><div class="list-container" data-list-key="systems">${renderList(systems, 'systems')}</div></div>`; }
    function renderDetails({reason, goals, log}) { const currentReport = DB.getActiveReport(); if (!currentReport) return; const canEdit = isEditMode && !currentReport.isFinished; document.getElementById('details').innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-8"><div class="bg-white p-6 rounded-xl shadow-sm"><h3 class="text-xl font-bold mb-4">Причина и цели</h3><div class="mb-4"><p class="text-lg"><span class="font-semibold">Тип:</span> ${canEdit ? `<input data-subfield="reason.type" class="editable-input" value="${reason?.type || ''}">` : reason?.type}</p><p class="text-lg mt-2"><span class="font-semibold">Описание:</span> ${canEdit ? `<textarea data-subfield="reason.description" class="editable-textarea">${reason?.description || ''}</textarea>` : reason?.description}</p></div><h4 class="font-semibold mb-2">Планируемые цели:</h4><div class="list-container" data-list-key="goals">${renderList(goals, 'goals')}</div></div><div class="bg-white p-6 rounded-xl shadow-sm"><h3 class="text-xl font-bold mb-4">Хронология выполнения</h3><div class="list-container" data-list-key="log">${renderLog(log)}</div></div></div>`; }
    function renderResults({goalsConfirmation, problems, rollback}) { const currentReport = DB.getActiveReport(); if (!currentReport) return; const canEdit = isEditMode && !currentReport.isFinished; document.getElementById('results').innerHTML = `<div class="bg-white p-6 rounded-xl shadow-sm"><h3 class="text-xl font-bold mb-4">Подтверждение достижения целей</h3><div class="list-container" data-list-key="results.goalsConfirmation">${renderGoalsConfirmation(goalsConfirmation)}</div></div><div class="mt-6 bg-white p-6 rounded-xl shadow-sm"><h3 class="text-xl font-bold mb-4 text-amber-700">Отклонения от плана и проблемы</h3>${canEdit ? `<textarea data-subfield="results.problems" class="editable-textarea">${problems || ''}</textarea>` : `<p>${problems || 'Не зафиксировано.'}</p>`}</div><div class="mt-6 bg-white p-6 rounded-xl shadow-sm"><h3 class="text-xl font-bold mb-4 text-red-700">Действия в случае неудачи (откат)</h3>${canEdit ? `<textarea data-subfield="results.rollback" class="editable-textarea">${rollback || ''}</textarea>` : `<p>${rollback || 'Не требовался.'}</p>`}</div>`; }
    function renderImpact({description, actions, improvements}) { const currentReport = DB.getActiveReport(); if (!currentReport) return; const canEdit = isEditMode && !currentReport.isFinished; document.getElementById('impact').innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-8"><div class="bg-white p-6 rounded-xl shadow-sm"><h3 class="text-xl font-bold mb-4">Влияние на сервисы</h3>${canEdit ? `<textarea data-subfield="impact.description" class="editable-textarea">${description || ''}</textarea>` : `<p>${description}</p>`}</div><div class="bg-white p-6 rounded-xl shadow-sm"><h3 class="text-xl font-bold mb-4">Рекомендации и последующие шаги</h3><h4 class="font-semibold mb-2">Необходимые действия:</h4><div class="list-container" data-list-key="impact.actions">${renderList(actions, 'impact.actions')}</div><h4 class="font-semibold mb-2 mt-4">Рекомендации по улучшению:</h4>${canEdit ? `<textarea data-subfield="impact.improvements" class="editable-textarea">${improvements || ''}</textarea>` : `<p>${improvements}</p>`}</div></div>`; }
    function renderMenu() { const menuContainer = document.getElementById('menu'); const users = appDB.employees || []; const formHtml = `<div class="bg-white p-6 rounded-xl shadow-sm"><h3 class="text-xl font-bold mb-4">Управление сотрудниками</h3><div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end"><div class="col-span-1"><label for="user-name-input" class="block text-sm font-medium text-gray-700">Имя и Фамилия</label><input type="text" id="user-name-input" placeholder="Иван Иванов" class="mt-1 editable-input"></div><div class="col-span-1"><label for="user-title-input" class="block text-sm font-medium text-gray-700">Должность</label><input type="text" id="user-title-input" placeholder="Системный администратор" class="mt-1 editable-input"></div><div class="col-span-1"><button id="add-user-btn" class="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center">${ICONS.USER_PLUS} Добавить сотрудника</button></div></div><h4 class="text-lg font-semibold mt-8 mb-3">Список сотрудников</h4><div id="user-list-container" class="space-y-2">${users.length > 0 ? users.map((user) => `<div class="flex items-center justify-between p-3 rounded-md bg-gray-50 border"><div><p class="font-semibold">${user.name}</p><p class="text-sm text-gray-600">${user.title}</p></div><button data-action="delete-user" data-id="${user.id}" class="text-red-500 hover:text-red-700 p-1">${ICONS.TRASH}</button></div>`).join('') : '<p class="text-stone-500 italic">Список сотрудников пуст.</p>'}</div></div>`; menuContainer.innerHTML = formHtml; }
    function renderList(items, listName) { const currentReport = DB.getActiveReport(); const canEdit = isEditMode && currentReport && !currentReport.isFinished; if (!items || items.length === 0) { return canEdit ? `<button data-action="add-item" class="mt-2 bg-blue-500 text-white px-3 py-1 rounded-md text-sm flex items-center hover:bg-blue-600">${ICONS.PLUS} Добавить</button>` : `<p class="text-stone-500 italic">Нет данных.</p>`; } if (listName === 'executors' && canEdit) { const renderExecutorSelect = (currentItem, index) => { let options = appDB.employees.map(e => `<option value="${e.fullName}" ${e.fullName === currentItem ? 'selected' : ''}>${e.fullName}</option>`).join(''); if (!appDB.employees.some(e => e.fullName === currentItem)) { options += `<option value="${currentItem}" selected>${currentItem} (вручную)</option>`; } return `<select data-index="${index}" class="editable-select flex-grow">${options}</select>`; }; const listHTML = `<ul class="space-y-2">${items.map((item, index) => `<li class="flex items-center gap-2">${renderExecutorSelect(item, index)}<button data-action="remove-item" data-index="${index}" class="text-red-500 hover:text-red-700 p-1">${ICONS.TRASH}</button></li>`).join('')}</ul>`; return listHTML + `<button data-action="add-item" class="mt-2 bg-blue-500 text-white px-3 py-1 rounded-md text-sm flex items-center hover:bg-blue-600">${ICONS.PLUS} Добавить</button>`; } const listHTML = canEdit ? `<ul class="space-y-2">${items.map((item, index) => `<li class="flex items-center gap-2"><input class="editable-input flex-grow" data-index="${index}" value="${item || ''}"><button data-action="remove-item" data-index="${index}" class="text-red-500 hover:text-red-700 p-1">${ICONS.TRASH}</button></li>`).join('')}</ul>` : (listName === 'systems' ? `<ul class="flex flex-wrap gap-2">${items.map(s => `<li class="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">${s}</li>`).join('')}</ul>` : `<ul class="list-disc list-inside space-y-2">${items.map(i => `<li>${i}</li>`).join('')}</ul>`); return listHTML + (canEdit ? `<button data-action="add-item" class="mt-2 bg-blue-500 text-white px-3 py-1 rounded-md text-sm flex items-center hover:bg-blue-600">${ICONS.PLUS} Добавить</button>` : ''); }
    function renderLog(items) { const currentReport = DB.getActiveReport(); const canEdit = isEditMode && currentReport && !currentReport.isFinished; if (!items || items.length === 0) return canEdit ? `<button data-action="add-item" class="mt-2 bg-blue-500 text-white px-3 py-1 rounded-md text-sm flex items-center hover:bg-blue-600">${ICONS.PLUS} Добавить запись</button>` : `<p class="text-stone-500 italic">Нет данных.</p>`; const listHTML = canEdit  ? `<div class="space-y-3">${items.map((item, index) => `<div class="grid grid-cols-1 md:grid-cols-5 gap-2 items-center"><input type="datetime-local" class="editable-input md:col-span-2" data-index="${index}" data-prop="time" value="${toISODateTimeString(item.time)}"><input class="editable-input md:col-span-2" data-index="${index}" data-prop="action" value="${item.action || ''}"><button data-action="remove-item" data-index="${index}" class="text-red-500 hover:text-red-700 p-1 justify-self-end">${ICONS.TRASH}</button></div>`).join('')}</div>` : `<ol class="relative border-l border-stone-300 ml-1">${items.map(item => `<li class="mb-4 ml-4"><div class="absolute w-3 h-3 bg-stone-300 rounded-full mt-1.5 -left-1.5 border border-white"></div><time class="mb-1 text-sm font-normal leading-none text-stone-500">${formatDateTime(item.time)}</time><p class="text-base font-normal text-stone-700">${item.action}</p></li>`).join('')}</ol>`; return listHTML + (canEdit ? `<button data-action="add-item" class="mt-2 bg-blue-500 text-white px-3 py-1 rounded-md text-sm flex items-center hover:bg-blue-600">${ICONS.PLUS} Добавить запись</button>` : ''); }
    function renderGoalsConfirmation(items) { const currentReport = DB.getActiveReport(); const canEdit = isEditMode && currentReport && !currentReport.isFinished; if (!items || items.length === 0) return canEdit ? `<button data-action="add-item" class="mt-2 bg-blue-500 text-white px-3 py-1 rounded-md text-sm flex items-center hover:bg-blue-600">${ICONS.PLUS} Добавить цель</button>`: `<p class="text-stone-500 italic">Нет данных.</p>`; const listHTML = canEdit ? `<div class="space-y-2">${items.map((item, index) => `<div class="flex items-center gap-2"><input class="editable-input flex-grow" data-index="${index}" data-prop="goal" value="${item.goal || ''}"><input type="checkbox" data-index="${index}" data-prop="achieved" ${item.achieved ? 'checked' : ''} class="h-5 w-5 rounded focus:ring-blue-500 text-blue-600"><button data-action="remove-item" data-index="${index}" class="text-red-500 hover:text-red-700 p-1">${ICONS.TRASH}</button></div>`).join('')}</div>` : `<ul class="space-y-3">${items.map(item => `<li class="flex items-start"><span class="mr-3 text-xl">${item.achieved ? '✔️' : '❌'}</span><span>${item.goal}</span></li>`).join('')}</ul>`; return listHTML + (canEdit ? `<button data-action="add-item" class="mt-2 bg-blue-500 text-white px-3 py-1 rounded-md text-sm flex items-center hover:bg-blue-600">${ICONS.PLUS} Добавить цель</button>` : ''); }
    function renderDbModal() { const reportIds = Object.keys(appDB.reports); if (reportIds.length === 0) { elements.dbModalContent.innerHTML = `<p class="text-center text-gray-500">Архив пуст. Создайте свой первый отчет.</p>`; return; } const reports = Object.values(appDB.reports).sort((a,b) => (a.data.id < b.data.id) ? 1 : -1); const reportListHtml = reports.map(reportData => { const id = Object.keys(appDB.reports).find(key => appDB.reports[key] === reportData); const report = reportData; const isActive = id === appDB.activeReportId; return ` <div class="p-3 my-2 rounded-lg flex items-center justify-between ${isActive ? 'bg-blue-100 border border-blue-300' : 'bg-gray-50 border'}"> <div> <h4 class="font-bold text-lg">${report.data.id}</h4> <p class="text-sm text-gray-600"> Автор: ${report.data.author} | Статус: <span class="font-semibold">${report.data.status}</span> |  Состояние: ${report.isFinished ? '<span class="text-green-600 font-bold">Завершен</span>' : '<span class="text-yellow-600 font-bold">В работе</span>'} </p> </div> <div class="flex items-center gap-2"> <button data-action="open-report" data-id="${id}" class="bg-green-500 text-white text-sm py-1 px-3 rounded hover:bg-green-600 ${isActive ? 'opacity-50 cursor-not-allowed' : ''}" ${isActive ? 'disabled' : ''}>Открыть</button> <button data-action="delete-report" data-id="${id}" class="bg-red-500 text-white text-sm py-1 px-3 rounded hover:bg-red-600">Удалить</button> </div> </div>`; }).join(''); elements.dbModalContent.innerHTML = reportListHtml; }

    // --- ОСТАЛЬНАЯ ЧАСТЬ КОДА ОСТАЕТСЯ БЕЗ ИЗМЕНЕНИЙ ---
    function set(obj, path, value) { try { const keys = path.split('.'); const lastKey = keys.pop(); const parent = keys.reduce((acc, key) => acc[key], obj); parent[lastKey] = value; } catch (e) { console.error(`Error setting path: ${path}`, e); } }
    function collectDataFromDOM() { const currentReport = DB.getActiveReport(); if (!currentReport) return null; const newData = JSON.parse(JSON.stringify(currentReport.data)); document.querySelectorAll('[data-field]').forEach(el => { newData[el.dataset.field] = el.value; }); document.querySelectorAll('[data-subfield]').forEach(el => { set(newData, el.dataset.subfield, el.value); }); document.querySelectorAll('.list-container[data-list-key]').forEach(container => { const key = container.dataset.listKey; const isObjectList = !!container.querySelector('[data-prop]'); let collectedItems = []; if (isObjectList) { const itemsByIndex = {}; container.querySelectorAll('[data-index]').forEach(input => { const index = input.dataset.index; if (!itemsByIndex[index]) itemsByIndex[index] = {}; const prop = input.dataset.prop; itemsByIndex[index][prop] = input.type === 'checkbox' ? input.checked : input.value; }); collectedItems = Object.values(itemsByIndex); } else {  container.querySelectorAll('[data-index]').forEach(input => { if (input.value.trim()) collectedItems.push(input.value.trim()); }); } set(newData, key, collectedItems); }); return newData; }
    async function saveChanges() { const activeId = appDB.activeReportId; if (!activeId) return; const updatedData = collectDataFromDOM(); if (!updatedData) return; elements.loadingOverlay.classList.remove('hidden'); try { await API.updateReport(activeId, { data: updatedData }); appDB.reports[activeId].data = updatedData; showToast('Отчет успешно сохранен!'); elements.editToggle.checked = false; toggleEditMode(false); } catch (e) { showToast('Ошибка сохранения!', 4000); } finally { elements.loadingOverlay.classList.add('hidden'); } }
    function getListByKey(data, key) {  try { return key.split('.').reduce((acc, part) => acc[part], data); } catch(e) { console.error(`Could not get list by key: ${key}`, e); return []; } }
    async function handleListAction(e) { const addUserBtn = e.target.closest('#add-user-btn'); if (addUserBtn) { const nameInput = document.getElementById('user-name-input'); const titleInput = document.getElementById('user-title-input'); if (!nameInput.value.trim() || !titleInput.value.trim()) { showToast("Заполните Имя, Фамилию и Должность", 3000); return; } const newEmployee = await API.createEmployee(nameInput.value.trim(), titleInput.value.trim()); appDB.employees.push(newEmployee); nameInput.value = ''; titleInput.value = ''; renderMenu(); showToast("Сотрудник добавлен."); return; } const target = e.target.closest('[data-action]'); if (!target) return; if (target.dataset.action === 'delete-user') { const employeeId = parseInt(target.dataset.id, 10); if(confirm(`Удалить этого сотрудника?`)) { await API.deleteEmployee(employeeId); appDB.employees = appDB.employees.filter(emp => emp.id !== employeeId); renderMenu(); if (DB.getActiveReport()) renderApp();  showToast("Сотрудник удален."); } return; } const currentReport = DB.getActiveReport(); if (!isEditMode || !currentReport) return; const currentData = collectDataFromDOM(); if(!currentData) return; appDB.reports[appDB.activeReportId].data = currentData; const container = target.closest('.list-container'); if (!container) return;  const listKey = container.dataset.listKey; const targetArray = getListByKey(currentData, listKey); if (target.dataset.action === 'add-item') { if (listKey === 'log') targetArray.push({ time: toISODateTimeString(new Date()), action: '' }); else if (listKey === 'results.goalsConfirmation') targetArray.push({ goal: '', achieved: false }); else if (listKey === 'executors' && appDB.employees.length > 0) targetArray.push(appDB.employees[0].fullName); else targetArray.push(''); } else if (target.dataset.action === 'remove-item') { if (!confirm('Вы уверены?')) return; targetArray.splice(parseInt(target.dataset.index, 10), 1); } else { return; } renderApp(); }
    function toggleEditMode() { const currentReport = DB.getActiveReport(); if(!currentReport){ elements.editToggle.checked = false; return; } const isFinished = currentReport.isFinished; isEditMode = elements.editToggle.checked && !isFinished; elements.saveBtn.classList.toggle('hidden', !isEditMode); renderApp(); }
    function downloadAsWord() { const report = DB.getActiveReport(); if (!report) { showToast("Нет отчета для экспорта.", 3000); return; } const data = report.data; let htmlContent = `<style> table { border-collapse: collapse; width: 100%; font-size: 11pt; } th, td { border: 1px solid #dddddd; text-align: left; padding: 8px; vertical-align: top;} th { background-color: #f2f2f2; } h1 {font-size: 22pt;} h2 {font-size: 16pt; margin-top: 15px;} ul {margin:0; padding-left: 20px;} </style> <h1>Отчет о технических работах: ${data.id}</h1> <table><tr><td style="width:30%;"><strong>Составлен</strong></td><td>${data.author}</td></tr><tr><td><strong>Дата</strong></td><td>${formatDate(data.date)}</td></tr><tr><td><strong>Итог работ</strong></td><td><strong>${data.status}</strong></td></tr></table> <h2>1. Общая информация</h2> <table><tr><td style="width:30%;"><strong>Начало работ</strong></td><td>${formatDateTime(data.startTime)}</td></tr><tr><td><strong>Окончание работ</strong></td><td>${formatDateTime(data.endTime)}</td></tr><tr><td><strong>Продолжительность</strong></td><td>${calculateDuration(data.startTime, data.endTime)}</td></tr><tr><td><strong>Затронутые системы</strong></td><td>${data.systems.join(', ')}</td></tr><tr><td><strong>Исполнители</strong></td><td>${data.executors.join(', ')}</td></tr></table> <h2>2. Детали Работ</h2> <table><tr><td style="width:30%;"><strong>Причина</strong></td><td>${data.reason.type} - ${data.reason.description}</td></tr><tr><td><strong>Планируемые цели</strong></td><td><ul>${data.goals.map(g => `<li>${g}</li>`).join('')}</ul></td></tr><tr><td><strong>Хронология</strong></td><td><ul>${data.log.map(l => `<li><strong>${formatDateTime(l.time)}:</strong> ${l.action}</li>`).join('')}</ul></td></tr></table> <h2>3. Результаты</h2> <table><tr><td style="width:30%;"><strong>Достижение целей</strong></td><td><ul>${data.results.goalsConfirmation.map(r => `<li>${r.goal} - <strong>${r.achieved ? 'Выполнено' : 'Не выполнено'}</strong></li>`).join('')}</ul></td></tr><tr><td><strong>Проблемы и отклонения</strong></td><td>${data.results.problems || 'Не зафиксировано.'}</td></tr><tr><td><strong>Действия по откату</strong></td><td>${data.results.rollback || 'Не требовались.'}</td></tr></table> <h2>4. Влияние и Рекомендации</h2> <table><tr><td style="width:30%;"><strong>Влияние на сервисы</strong></td><td>${data.impact.description}</td></tr><tr><td><strong>Дальнейшие действия</strong></td><td><ul>${data.impact.actions.map(a => `<li>${a}</li>`).join('')}</ul></td></tr><tr><td><strong>Рекомендации</strong></td><td>${data.impact.improvements}</td></tr></table>`; saveAs(htmlDocx.asBlob(htmlContent), `${data.id.replace(/[^a-z0-9а-яё]/gi, ' ').trim().replace(/\s+/g, '_')}.docx`); }

    async function init() {
        elements.loadingOverlay.classList.remove('hidden');
        try {
            await DB.load();
            if (Object.keys(appDB.reports).length === 0 && appDB.employees.length === 0) {
                const newReportId = await API.createReport();
                appDB.activeReportId = newReportId;
                await DB.load();
            }
            renderApp();
        } catch(e) {
            document.body.innerHTML = '<div class="text-center p-8"><h1>Ошибка загрузки данных</h1><p>Не удалось подключиться к серверу. Попробуйте обновить страницу.</p></div>';
        }
        elements.loadingOverlay.classList.add('hidden');
    }

    elements.openDbModalBtn.addEventListener('click', () => { renderDbModal(); elements.dbModal.classList.remove('hidden'); });
    elements.closeModalBtn.addEventListener('click', () => elements.dbModal.classList.add('hidden'));
    elements.createNewReportBtn.addEventListener('click', async () => { const newReportId = await API.createReport(); appDB.activeReportId = newReportId; await DB.load(); init(); elements.dbModal.classList.add('hidden'); showToast("Новый отчет создан!"); });
// ЗАМЕНИТЕ НА ЭТОТ КОД
elements.dbModal.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    const id = e.target.dataset.id;
    if (!action || !id) return;

    if (action === 'open-report') {
        // 1. Устанавливаем новый активный ID в нашем локальном состоянии.
        appDB.activeReportId = id;

        // 2. Вместо полной перезагрузки данных (init()), мы просто перерисовываем
        // интерфейс с уже имеющимися данными, используя новый activeReportId.
        renderApp(); 

        // 3. Закрываем модальное окно.
        elements.dbModal.classList.add('hidden');
        
    } else if (action === 'delete-report') {
        if (!confirm(`Вы уверены, что хотите удалить отчет? Это действие необратимо.`)) return;
        await API.deleteReport(id);
        showToast("Отчет удален.");
        if (appDB.activeReportId === id) {
            appDB.activeReportId = null;
        }
        await init();
        renderDbModal();
    }
});
    elements.editToggle.addEventListener('change', () => toggleEditMode());
    elements.saveBtn.addEventListener('click', saveChanges);
    elements.downloadBtn.addEventListener('click', downloadAsWord);
    elements.appContent.addEventListener('click', handleListAction);
    elements.finishReportBtn.addEventListener('click', async () => { const report = DB.getActiveReport(); if(!report) return; await saveChanges(); const newStatus = !report.isFinished; await API.updateReport(appDB.activeReportId, { isFinished: newStatus }); report.isFinished = newStatus; if(newStatus) { isEditMode = false; elements.editToggle.checked = false; toggleEditMode(false); showToast('Отчет помечен как завершенный!'); } else { showToast('Работа над отчетом возобновлена!'); } renderHeader(report); });
    elements.navLinks.forEach(link => { link.addEventListener('click', (e) => { e.preventDefault(); const tabId = link.getAttribute('data-tab'); elements.navLinks.forEach(l => l.classList.remove('active')); link.classList.add('active'); document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active')); document.getElementById(tabId).classList.add('active'); }); });

    init();
});