let charts = [];

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

function debug(...args) {
    console.log('[🧪 DEBUG]', ...args);
}

function clearCharts() {
    charts.forEach(c => c.destroy());
    charts = [];

    document.querySelectorAll('.chart-grid div').forEach(div => {
        div.innerHTML = '<canvas></canvas>';
    });

    const ids = ['statusChart', 'priorityChart', 'agentChart', 'categoryChart'];
    document.querySelectorAll('.chart-grid div').forEach((div, i) => {
        const canvas = document.createElement('canvas');
        canvas.id = ids[i];
        div.innerHTML = '';
        div.appendChild(canvas);
    });
}

function resetFilter() {
    document.getElementById('from-date').value = '';
    document.getElementById('to-date').value = '';
    loadAnalytics();
}

function buildChart(ctxId, type, labels, values, label, bg) {
    const ctx = document.getElementById(ctxId);
    const container = ctx.parentNode;

    if (values.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'no-data';
        msg.textContent = 'No Data\nTry adjusting the date range above.';
        container.innerHTML = '';
        container.appendChild(msg);
        return;
    }

    const chart = new Chart(ctx, {
        type,
        data: {
            labels,
            datasets: [{
                label,
                data: values,
                backgroundColor: bg || ['#36a2eb', '#ff6384', '#4bc0c0', '#9966ff', '#ff9f40']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: label }
            }
        }
    });

    charts.push(chart);
}

async function loadAnalytics() {
    clearCharts();

    const from = document.getElementById('from-date').value;
    const to = document.getElementById('to-date').value;
    let url = '/api/analytics/overview';
    if (from && to) url += `?from=${from}&to=${to}`;

    const email = getCookie("user_email");
    debug('Email from cookie:', email);

    if (!email) {
        debug('Email not found in cookie. Redirecting...');
        window.location.href = '/';
        return;
    }

    const res = await fetch(`/api/is-support-agent?email=${encodeURIComponent(email)}`);
    const data = await res.json();

    debug('Support agent access level:', data);

    if (!data || !['senior', 'admin'].includes(data.access_level)) {
        alert('Access denied. Only senior or admin can view analytics.');
        window.location.href = '/';
        return;
    }

    fetch(url)
        .then(res => {
            debug('Analytics API response status:', res.status);
            return res.json();
        })
        .then(data => {
            debug('Analytics data received:', data);
            buildChart('statusChart', 'doughnut', data.statusBreakdown.map(s => s.status), data.statusBreakdown.map(s => s.count), 'Ticket Status');
            buildChart('priorityChart', 'bar', data.priorityBreakdown.map(p => p.priority), data.priorityBreakdown.map(p => p.count), 'Ticket Priority');
            buildChart('agentChart', 'bar', data.agentLoad.map(a => a.name), data.agentLoad.map(a => a.count), 'Agent Activity');
            buildChart('categoryChart', 'bar', data.categoryUsage.map(c => c.name), data.categoryUsage.map(c => c.count), 'Tickets by Category');
        })
        .catch(err => {
            console.error('[❌]', err);
        });
}

document.addEventListener('DOMContentLoaded', async () => {
    debug('DOM loaded');
    await loadAnalytics();
    document.getElementById('apply-filter').addEventListener('click', loadAnalytics);
    document.getElementById('reset-filter').addEventListener('click', resetFilter);
});
