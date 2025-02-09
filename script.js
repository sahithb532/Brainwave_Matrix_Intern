class TaskManager {
    constructor() {
        this.tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        this.templates = JSON.parse(localStorage.getItem('templates')) || this.getDefaultTemplates();
        this.customFields = JSON.parse(localStorage.getItem('customFields')) || [];
        this.teamMembers = JSON.parse(localStorage.getItem('teamMembers')) || [];
        this.initializeElements();
        this.addEventListeners();
        this.updateDisplay();
        this.displayCurrentDate();
        
        // Initialize theme
        this.theme = localStorage.getItem('theme') || 'light';
        this.applyTheme();
        
        // Initialize weather
        this.getWeatherData();
        this.initializeKanban();
        this.initializeTemplates();
        this.initializeCustomFields();
        this.initializeTeamManagement();
        this.initializeExport();
    }

    initializeElements() {
        this.taskList = document.getElementById('task-list');
        this.addTaskBtn = document.getElementById('add-task');
        this.modal = document.getElementById('task-modal');
        this.closeBtn = document.querySelector('.close');
        this.taskForm = document.getElementById('task-form');
        this.filterSelect = document.getElementById('filter-tasks');
        this.themeToggle = document.getElementById('theme-toggle');
        this.weatherWidget = document.getElementById('weather-widget');
        this.ganttChart = null;
        this.burndownChart = null;
    }

    addEventListeners() {
        this.addTaskBtn.addEventListener('click', () => this.openModal());
        this.closeBtn.addEventListener('click', () => this.closeModal());
        this.taskForm.addEventListener('submit', (e) => this.handleTaskSubmit(e));
        this.filterSelect.addEventListener('change', () => this.updateDisplay());
        
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });
        
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    displayCurrentDate() {
        const dateDisplay = document.getElementById('current-date');
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateDisplay.textContent = new Date().toLocaleDateString('en-US', options);
    }

    openModal() {
        this.modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        
        // Set default dates
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('task-start-date').value = today;
        document.getElementById('task-end-date').value = today;
    }

    closeModal() {
        this.modal.style.display = 'none';
        document.body.style.overflow = 'auto'; // Restore scrolling
        this.taskForm.reset();
    }

    handleTaskSubmit(e) {
        e.preventDefault();
        
        // Collect custom fields
        const customFields = Array.from(document.querySelectorAll('.custom-field')).map(field => ({
            name: field.querySelector('.custom-field-name').value,
            value: field.querySelector('.custom-field-value').value
        }));

        // Collect assignees
        const assignees = Array.from(document.getElementById('task-assignees').selectedOptions)
            .map(option => option.value);

        const task = {
            id: Date.now(),
            title: document.getElementById('task-title').value,
            description: document.getElementById('task-description').value,
            startDate: document.getElementById('task-start-date').value,
            endDate: document.getElementById('task-end-date').value,
            time: document.getElementById('task-time').value,
            priority: document.getElementById('task-priority').value,
            milestone: document.getElementById('milestone').value,
            parentId: document.getElementById('parent-task').value,
            customFields,
            assignees,
            notifyAssignees: document.getElementById('notify-assignees').checked,
            notifyWatchers: document.getElementById('notify-watchers').checked,
            status: 'todo',
            important: false,
            completed: false,
            createdAt: new Date()
        };

        this.tasks.push(task);
        this.saveTasks();
        this.updateDisplay();
        this.updateKanbanBoard();
        this.notifyUsers(task);
        this.closeModal();
    }

    saveTasks() {
        localStorage.setItem('tasks', JSON.stringify(this.tasks));
    }

    deleteTask(taskId) {
        console.log('Deleting task:', taskId);
        // Remove task from tasks array
        this.tasks = this.tasks.filter(task => task.id !== taskId);
        this.saveTasks();
        
        // Update all views
        this.updateDisplay();
        this.updateKanbanBoard();

        // Remove the task element from DOM if it exists
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        if (taskElement) {
            taskElement.remove();
        }

        // Update task counts
        const stats = this.calculateProductivityStats();
        document.getElementById('total-tasks').textContent = `${stats.totalTasks} Total`;
        document.getElementById('completed-tasks').textContent = `${stats.completedTasks} Completed`;
        document.getElementById('pending-tasks').textContent = 
            `${stats.totalTasks - stats.completedTasks} Pending`;
    }

    toggleTaskStatus(taskId) {
        const task = this.tasks.find(task => task.id === taskId);
        if (task) {
            task.completed = !task.completed;
            if (task.completed) {
                task.completedAt = new Date();
            } else {
                delete task.completedAt;
            }
            this.saveTasks();
            this.updateDisplay();
            this.updateCharts();
        }
    }

    toggleImportant(taskId) {
        const task = this.tasks.find(task => task.id === taskId);
        if (task) {
            task.important = !task.important;
            this.saveTasks();
            this.updateDisplay();
            this.updateCharts();
            
            // Add visual feedback
            const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
            if (taskElement) {
                taskElement.classList.toggle('important');
            }
        }
    }

    updateDisplay() {
        const filter = this.filterSelect.value;
        let filteredTasks = [...this.tasks];

        switch(filter) {
            case 'pending':
                filteredTasks = this.tasks.filter(task => !task.completed);
                break;
            case 'completed':
                filteredTasks = this.tasks.filter(task => task.completed);
                break;
            case 'important':
                filteredTasks = this.tasks.filter(task => task.priority === 'high');
                break;
        }

        this.renderTasks(filteredTasks);
    }

    renderTasks(tasks) {
        this.taskList.innerHTML = '';
        
        tasks.sort((a, b) => {
            if (a.important && !b.important) return -1;
            if (!a.important && b.important) return 1;
            return new Date('1970/01/01 ' + a.time) - new Date('1970/01/01 ' + b.time);
        });

        tasks.forEach(task => {
            const taskElement = document.createElement('div');
            taskElement.className = `task-item priority-${task.priority} ${task.completed ? 'completed' : ''} ${task.important ? 'important' : ''}`;
            
            // Create the checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = task.completed;
            checkbox.addEventListener('change', () => this.toggleTaskStatus(task.id));
            
            // Create the content div
            const contentDiv = document.createElement('div');
            contentDiv.className = 'task-content';
            contentDiv.innerHTML = `
                <div class="task-title">${task.title}</div>
                <div class="task-description">${task.description}</div>
                <div class="task-time">${task.time}</div>
            `;
            
            // Create the actions div
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'task-actions';
            
            // Create star button
            const starButton = document.createElement('button');
            starButton.className = `btn star-btn ${task.important ? 'starred' : ''}`;
            starButton.innerHTML = `<i class="fa-solid ${task.important ? 'fa-star' : 'fa-regular fa-star'}"></i>`;
            starButton.addEventListener('click', () => {
                this.toggleImportant(task.id);
                // Add immediate visual feedback
                starButton.classList.toggle('starred');
                starButton.querySelector('i').className = `fa-solid ${task.important ? 'fa-star' : 'fa-regular fa-star'}`;
            });
            
            // Create delete button
            const deleteButton = document.createElement('button');
            deleteButton.className = 'btn delete-btn';
            deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
            deleteButton.addEventListener('click', () => this.deleteTask(task.id));
            
            // Append all elements
            actionsDiv.appendChild(starButton);
            actionsDiv.appendChild(deleteButton);
            
            taskElement.appendChild(checkbox);
            taskElement.appendChild(contentDiv);
            taskElement.appendChild(actionsDiv);
            
            taskElement.setAttribute('data-task-id', task.id);
            
            this.taskList.appendChild(taskElement);
        });

        // Update task counts
        document.getElementById('total-tasks').textContent = `${tasks.length} Total`;
        document.getElementById('completed-tasks').textContent = 
            `${tasks.filter(task => task.completed).length} Completed`;
        document.getElementById('pending-tasks').textContent = 
            `${tasks.filter(task => !task.completed).length} Pending`;
    }

    // Theme Toggle Implementation
    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        this.applyTheme();
        localStorage.setItem('theme', this.theme);
    }

    applyTheme() {
        const root = document.documentElement;
        const isDark = this.theme === 'dark';
        
        root.style.setProperty('--background-color', isDark ? '#1a1a1a' : '#f0f7ff');
        root.style.setProperty('--text-color', isDark ? '#ffffff' : '#2c3e50');
        root.style.setProperty('--card-background', isDark ? 'rgba(37, 37, 37, 0.95)' : 'rgba(255, 255, 255, 0.95)');
        
        // Update theme toggle icon
        const themeIcon = this.themeToggle.querySelector('i');
        themeIcon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        
        // Update body background
        document.body.style.background = isDark 
            ? 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)'
            : 'linear-gradient(135deg, #e0f7fa 0%, #f3e5f5 100%)';
    }

    // Weather Implementation
    async getWeatherData() {
        try {
            // First, get user's location
            const position = await this.getCurrentPosition();
            const { latitude, longitude } = position.coords;
            
            // Using Open-Meteo API (free, no API key required)
            const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=celsius`
            );
            
            if (!response.ok) throw new Error('Weather data not available');
            
            const data = await response.json();
            this.updateWeatherWidget(data);
        } catch (error) {
            console.error('Weather error:', error);
            this.weatherWidget.innerHTML = `
                <i class="fas fa-exclamation-circle"></i>
                Weather unavailable
            `;
        }
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
    }

    updateWeatherWidget(data) {
        const temp = Math.round(data.current_weather.temperature);
        const weathercode = data.current_weather.weathercode;
        const description = this.getWeatherDescription(weathercode);
        const icon = this.getWeatherIcon(weathercode);
        
        this.weatherWidget.innerHTML = `
            <i class="${icon}"></i>
            ${temp}°C ${description}
        `;
    }

    getWeatherIcon(code) {
        // WMO Weather interpretation codes (https://open-meteo.com/en/docs)
        const icons = {
            0: 'fas fa-sun', // Clear sky
            1: 'fas fa-sun', // Mainly clear
            2: 'fas fa-cloud-sun', // Partly cloudy
            3: 'fas fa-cloud', // Overcast
            45: 'fas fa-smog', // Foggy
            48: 'fas fa-smog', // Depositing rime fog
            51: 'fas fa-cloud-rain', // Light drizzle
            53: 'fas fa-cloud-rain', // Moderate drizzle
            55: 'fas fa-cloud-rain', // Dense drizzle
            61: 'fas fa-cloud-rain', // Slight rain
            63: 'fas fa-cloud-rain', // Moderate rain
            65: 'fas fa-cloud-showers-heavy', // Heavy rain
            71: 'fas fa-snowflake', // Slight snow fall
            73: 'fas fa-snowflake', // Moderate snow fall
            75: 'fas fa-snowflake', // Heavy snow fall
            77: 'fas fa-snowflake', // Snow grains
            80: 'fas fa-cloud-rain', // Slight rain showers
            81: 'fas fa-cloud-rain', // Moderate rain showers
            82: 'fas fa-cloud-showers-heavy', // Violent rain showers
            85: 'fas fa-snowflake', // Slight snow showers
            86: 'fas fa-snowflake', // Heavy snow showers
            95: 'fas fa-bolt', // Thunderstorm
            96: 'fas fa-bolt', // Thunderstorm with slight hail
            99: 'fas fa-bolt', // Thunderstorm with heavy hail
        };
        return icons[code] || 'fas fa-cloud';
    }

    getWeatherDescription(code) {
        const descriptions = {
            0: 'Clear sky',
            1: 'Mainly clear',
            2: 'Partly cloudy',
            3: 'Overcast',
            45: 'Foggy',
            48: 'Foggy',
            51: 'Light drizzle',
            53: 'Moderate drizzle',
            55: 'Dense drizzle',
            61: 'Slight rain',
            63: 'Moderate rain',
            65: 'Heavy rain',
            71: 'Light snow',
            73: 'Moderate snow',
            75: 'Heavy snow',
            77: 'Snow grains',
            80: 'Light showers',
            81: 'Moderate showers',
            82: 'Heavy showers',
            85: 'Light snow showers',
            86: 'Heavy snow showers',
            95: 'Thunderstorm',
            96: 'Thunderstorm with hail',
            99: 'Thunderstorm with heavy hail',
        };
        return descriptions[code] || 'Unknown';
    }

    initializeKanban() {
        this.setupDragAndDrop();
        this.updateKanbanBoard();
    }

    setupDragAndDrop() {
        const kanbanItems = document.querySelectorAll('.kanban-items');
        
        kanbanItems.forEach(column => {
            column.addEventListener('dragover', e => {
                e.preventDefault();
                const draggingItem = document.querySelector('.dragging');
                const afterElement = this.getDragAfterElement(column, e.clientY);
                
                if (afterElement) {
                    column.insertBefore(draggingItem, afterElement);
                } else {
                    column.appendChild(draggingItem);
                }
            });
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.kanban-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    updateKanbanBoard() {
        const columns = {
            todo: document.querySelector('[data-status="todo"]'),
            'in-progress': document.querySelector('[data-status="in-progress"]'),
            review: document.querySelector('[data-status="review"]'),
            done: document.querySelector('[data-status="done"]')
        };
        
        // Clear all columns
        Object.values(columns).forEach(column => column.innerHTML = '');
        
        // Distribute tasks to columns
        this.tasks.forEach(task => {
            const taskElement = this.createKanbanItem(task);
            const status = task.completed ? 'done' : task.status || 'todo';
            columns[status].appendChild(taskElement);
        });
    }

    createKanbanItem(task) {
        const item = document.createElement('div');
        item.className = `kanban-item priority-${task.priority} ${task.important ? 'important' : ''}`;
        item.draggable = true;
        item.setAttribute('data-task-id', task.id);
        
        item.innerHTML = `
            <div class="task-title">${task.title}</div>
            <div class="task-description">${task.description}</div>
            <div class="task-meta">
                <span class="task-time">${task.time}</span>
                <div class="task-actions">
                    <button class="btn star-btn ${task.important ? 'starred' : ''}" onclick="event.stopPropagation(); taskManager.toggleImportant(${task.id})">
                        <i class="fa-solid ${task.important ? 'fa-star' : 'fa-regular fa-star'}"></i>
                    </button>
                    <button class="btn delete-btn" onclick="event.stopPropagation(); taskManager.deleteTask(${task.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Add drag events
        item.addEventListener('dragstart', () => {
            item.classList.add('dragging');
        });
        
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            const newStatus = item.parentElement.dataset.status;
            const taskId = parseInt(item.dataset.taskId);
            this.updateTaskStatus(taskId, newStatus);
        });
        
        return item;
    }

    updateTaskStatus(taskId, newStatus) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.status = newStatus;
            task.completed = newStatus === 'done';
            this.saveTasks();
            this.updateDisplay();
        }
    }

    getDefaultTemplates() {
        return [
            {
                id: 'bug',
                name: 'Bug Report',
                fields: {
                    title: 'Bug: ',
                    description: '**Steps to Reproduce:**\n1.\n2.\n3.\n\n**Expected Behavior:**\n\n**Actual Behavior:**\n\n**Environment:**\n',
                    priority: 'high'
                }
            },
            {
                id: 'feature',
                name: 'Feature Request',
                fields: {
                    title: 'Feature: ',
                    description: '**Description:**\n\n**Use Cases:**\n\n**Proposed Solution:**\n',
                    priority: 'medium'
                }
            }
        ];
    }

    initializeTemplates() {
        const templateSelect = document.getElementById('task-template');
        templateSelect.addEventListener('change', () => this.applyTemplate(templateSelect.value));
    }

    applyTemplate(templateId) {
        const template = this.templates.find(t => t.id === templateId);
        if (!template) return;

        Object.entries(template.fields).forEach(([field, value]) => {
            const element = document.getElementById(`task-${field}`);
            if (element) element.value = value;
        });
    }

    initializeCustomFields() {
        const container = document.getElementById('custom-fields-container');
        const addButton = document.getElementById('add-custom-field');

        addButton.addEventListener('click', () => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'custom-field';
            fieldDiv.innerHTML = `
                <input type="text" placeholder="Field Name" class="custom-field-name">
                <input type="text" placeholder="Field Value" class="custom-field-value">
                <button type="button" class="btn delete-btn">
                    <i class="fas fa-trash"></i>
                </button>
            `;

            container.appendChild(fieldDiv);
        });
    }

    notifyUsers(task) {
        if (task.notifyAssignees) {
            task.assignees.forEach(userId => {
                // In a real application, you would send notifications to users
                console.log(`Notifying user ${userId} about new task: ${task.title}`);
            });
        }
    }

    renderTask(task) {
        // ... existing render code ...

        // Add milestone if exists
        if (task.milestone) {
            const milestoneSpan = document.createElement('span');
            milestoneSpan.className = 'milestone-tag';
            milestoneSpan.textContent = task.milestone;
            contentDiv.appendChild(milestoneSpan);
        }

        // Add custom fields
        if (task.customFields && task.customFields.length > 0) {
            const customFieldsDiv = document.createElement('div');
            customFieldsDiv.className = 'custom-fields-display';
            task.customFields.forEach(field => {
                const fieldSpan = document.createElement('span');
                fieldSpan.className = 'custom-field-value';
                fieldSpan.textContent = `${field.name}: ${field.value}`;
                customFieldsDiv.appendChild(fieldSpan);
            });
            contentDiv.appendChild(customFieldsDiv);
        }

        // Add hierarchy styling if it's a child task
        if (task.parentId) {
            taskElement.classList.add('task-hierarchy');
        }
    }

    initializeTeamManagement() {
        const addMemberBtn = document.getElementById('add-member');
        const teamModal = document.getElementById('team-modal');
        const teamForm = document.getElementById('team-form');
        const closeBtn = teamModal.querySelector('.close');

        addMemberBtn.addEventListener('click', () => {
            teamModal.style.display = 'block';
        });

        // Add close button functionality
        closeBtn.addEventListener('click', () => {
            teamModal.style.display = 'none';
            teamForm.reset();
        });

        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === teamModal) {
                teamModal.style.display = 'none';
                teamForm.reset();
            }
        });

        teamForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTeamMember();
            teamModal.style.display = 'none';
            teamForm.reset();
        });

        this.renderTeamMembers();
    }

    addTeamMember() {
        const member = {
            id: Date.now(),
            name: document.getElementById('member-name').value,
            email: document.getElementById('member-email').value,
            role: document.getElementById('member-role').value,
            status: 'online',
            avatar: this.generateAvatar(document.getElementById('member-name').value)
        };

        this.teamMembers.push(member);
        localStorage.setItem('teamMembers', JSON.stringify(this.teamMembers));
        this.renderTeamMembers();
    }

    generateAvatar(name) {
        return name.split(' ').map(n => n[0]).join('').toUpperCase();
    }

    renderTeamMembers() {
        const container = document.getElementById('team-members');
        container.innerHTML = '';

        this.teamMembers.forEach(member => {
            const memberElement = document.createElement('div');
            memberElement.className = 'team-member';
            memberElement.innerHTML = `
                <div class="member-avatar">${member.avatar}</div>
                <div class="member-info">
                    <div class="member-name">${member.name}</div>
                    <div class="member-role">${member.role}</div>
                </div>
                <div class="member-status ${member.status}"></div>
            `;
            container.appendChild(memberElement);
        });

        // Update assignee options in task form
        const assigneeSelect = document.getElementById('task-assignees');
        assigneeSelect.innerHTML = this.teamMembers.map(member => `
            <option value="${member.id}">${member.name}</option>
        `).join('');
    }

    calculateProductivityStats() {
        const stats = {
            totalTasks: this.tasks.length,
            completedTasks: this.tasks.filter(t => t.completed).length,
            tasksThisWeek: this.tasks.filter(t => {
                const taskDate = new Date(t.createdAt);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return taskDate > weekAgo;
            }).length,
            completionRate: 0
        };

        stats.completionRate = stats.totalTasks ? 
            Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

        return stats;
    }

    initializeExport() {
        const exportBtn = document.getElementById('export-tasks');
        exportBtn.addEventListener('click', () => this.exportTasks());
    }

    exportTasks() {
        // Create export data with formatted tasks
        const exportData = this.tasks.map(task => ({
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            startDate: task.startDate,
            endDate: task.endDate,
            time: task.time,
            completed: task.completed ? 'Yes' : 'No',
            important: task.important ? 'Yes' : 'No',
            assignees: this.getAssigneeNames(task.assignees),
            milestone: task.milestone || 'None',
            customFields: task.customFields?.map(field => `${field.name}: ${field.value}`).join('; ') || ''
        }));

        // Convert to CSV
        const csvContent = this.convertToCSV(exportData);
        
        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `tasks_export_${new Date().toLocaleDateString()}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    convertToCSV(data) {
        if (data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const rows = [
            headers.join(','), // Header row
            ...data.map(row => 
                headers.map(header => {
                    let cell = row[header] || '';
                    // Escape quotes and wrap in quotes if contains comma
                    cell = cell.toString().replace(/"/g, '""');
                    if (cell.includes(',')) {
                        cell = `"${cell}"`;
                    }
                    return cell;
                }).join(',')
            )
        ];
        
        return rows.join('\n');
    }

    getAssigneeNames(assigneeIds) {
        if (!assigneeIds) return '';
        return assigneeIds
            .map(id => {
                const member = this.teamMembers.find(m => m.id === parseInt(id));
                return member ? member.name : '';
            })
            .filter(name => name)
            .join(', ');
    }
}

const taskManager = new TaskManager(); 