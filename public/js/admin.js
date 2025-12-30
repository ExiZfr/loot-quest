// ADMIN GOD MODE SCRIPT
let withdrawalsData = [];
let currentInspectId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    init();

    // Auto-refresh every 30 seconds
    setInterval(init, 30000);
});

async function init() {
    try {
        await Promise.all([
            fetchStats(),
            fetchWithdrawals()
        ]);
        document.getElementById('auth-overlay').classList.add('hidden');
    } catch (e) {
        console.error('Init failed:', e);
        if (e.message.includes('401') || e.message.includes('403')) {
            window.location.href = '/?error=admin_only';
        }
    }
}

async function refreshData() {
    const btn = document.querySelector('button[onclick="refreshData()"] i');
    btn.classList.add('animate-spin');
    await init();
    setTimeout(() => btn.classList.remove('animate-spin'), 1000);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. STATS MONITOR
// ═══════════════════════════════════════════════════════════════════════════
async function fetchStats() {
    const res = await fetch('/api/admin/stats', {
        credentials: 'include'
    });
    if (res.status === 401 || res.status === 403) throw new Error(res.status);
    const data = await res.json();

    if (data.success) {
        const s = data.stats;
        animateValue('stat-users', s.totalUsers);
        animateValue('stat-online', s.onlineUsers);
        animateValue('stat-pending', s.pendingRequests);
        document.getElementById('stat-revenue').innerText = '$' + s.dailyRevenueEst.toFixed(2);
    }
}

function animateValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    // Ensure value is a number, default to 0 if undefined/null
    el.innerText = (value || 0).toLocaleString();
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. KILL ZONE (WITHDRAWALS)
// ═══════════════════════════════════════════════════════════════════════════
async function fetchWithdrawals() {
    const res = await fetch('/api/admin/withdrawals/pending', {
        credentials: 'include'
    });
    if (!res.ok) return; // Silent fail if auth issue (handled by stats)

    const data = await res.json();
    if (data.success) {
        withdrawalsData = data.withdrawals;
        renderWithdrawals();
    }
}

function renderWithdrawals() {
    const list = document.getElementById('withdrawals-list');
    const emptyState = document.getElementById('empty-state');

    if (withdrawalsData.length === 0) {
        list.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    list.innerHTML = withdrawalsData.map(w => {
        const riskLevel = w.security.flags.length > 0 ? 'HIGH' : 'LOW';
        const riskClass = riskLevel === 'HIGH' ? 'text-loot-danger' : 'text-green-500';
        const riskIcon = riskLevel === 'HIGH' ? 'shield-alert' : 'shield-check';
        const rowClass = riskLevel === 'HIGH' ? 'bg-loot-danger/5' : '';

        return `
            <tr class="hover:bg-white/5 transition-colors border-b border-white/5 ${rowClass}">
                <td class="p-4">
                    <div class="flex items-center gap-2 ${riskClass} font-bold text-xs">
                        <i data-lucide="${riskIcon}" class="w-4 h-4"></i> ${riskLevel}
                    </div>
                </td>
                <td class="p-4">
                    <div class="font-bold text-white">${w.email}</div>
                    <div class="text-xs text-gray-500 font-mono">ID: ${w.user_id}</div>
                </td>
                <td class="p-4">
                    <div class="text-loot-neon font-bold">${w.reward_name}</div>
                    <div class="text-xs text-loot-gold">${w.points_spent.toLocaleString()} PTS</div>
                </td>
                <td class="p-4 text-gray-400 text-xs">
                    ${dayjs(w.request_date).fromNow(true)}
                </td>
                <td class="p-4 text-right">
                    <button onclick="openInspect('${w.id}')" class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition-all border border-white/10">
                        INSPECT
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    lucide.createIcons();
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. INSPECTION MODAL
// ═══════════════════════════════════════════════════════════════════════════
function openInspect(id) {
    // Find data is string (from map) but id is int in DB? Or string?
    // DB id is Integer for withdrawals, string for UUIDs. Let's force weak comparison or convert.
    const w = withdrawalsData.find(item => item.id == id);
    if (!w) return;

    currentInspectId = id;

    // Populate Modal
    document.getElementById('modal-user-id').innerText = `Full User ID: ${w.user_id}`;
    document.getElementById('modal-ip').innerText = w.registration_ip || 'Unknown';
    document.getElementById('modal-age').innerText = dayjs(w.user_joined_at).fromNow(true);
    document.getElementById('modal-earned').innerText = (w.total_earned || 0).toLocaleString() + ' PTS';
    document.getElementById('modal-request').innerText = w.reward_name;

    // Flags
    const flagsContainer = document.getElementById('modal-flags-container');
    const flagsList = document.getElementById('modal-flags');

    if (w.security.flags.length > 0) {
        flagsContainer.classList.remove('hidden');
        flagsList.innerHTML = w.security.flags.map(f => `
            <span class="px-2 py-1 bg-loot-danger/20 text-loot-danger border border-loot-danger/30 rounded text-xs font-bold security-flag">
                ${f.replace('_', ' ')}
            </span>
        `).join('');

        // IP Warning specific
        if (w.security.flags.includes('IP_CHANGE')) {
            document.getElementById('ip-warning').classList.remove('hidden');
        } else {
            document.getElementById('ip-warning').classList.add('hidden');
        }
    } else {
        flagsContainer.classList.add('hidden');
        document.getElementById('ip-warning').classList.add('hidden');
    }

    // Task History
    const historyList = document.getElementById('modal-history');
    if (w.security.recentTasks && w.security.recentTasks.length > 0) {
        historyList.innerHTML = w.security.recentTasks.map(t => `
            <tr class="border-b border-white/5 last:border-0 hover:bg-white/5">
                <td class="p-2 text-white">${t.offer_name || t.source}</td>
                <td class="p-2 text-loot-gold">+${t.amount}</td>
                <td class="p-2 text-gray-500">${dayjs(t.created_at).fromNow()}</td>
            </tr>
        `).join('');
    } else {
        historyList.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No recent tasks</td></tr>';
    }

    // Attach Action Listeners
    document.getElementById('btn-approve').onclick = () => performAction('approve');
    document.getElementById('btn-reject').onclick = () => performAction('reject');

    // Show
    const modal = document.getElementById('inspect-modal');
    const content = document.getElementById('modal-content');
    modal.classList.remove('hidden');
    // Small timeout for transition
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

function closeModal() {
    const modal = document.getElementById('inspect-modal');
    const content = document.getElementById('modal-content');

    modal.classList.add('opacity-0');
    content.classList.add('scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
    currentInspectId = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. ACTIONS
// ═══════════════════════════════════════════════════════════════════════════
async function performAction(action) {
    if (!currentInspectId) return;

    const reason = prompt(action === 'reject' ? "Reason for rejection (sent to user):" : "Confirm approval note:", action === 'reject' ? "Suspicious activity" : "Verified");
    if (reason === null) return; // Cancelled

    // UI Loading state
    const btn = document.getElementById(action === 'approve' ? 'btn-approve' : 'btn-reject');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<div class="animate-spin w-5 h-5 border-2 border-white/50 border-t-white rounded-full"></div>';

    try {
        const res = await fetch(`/api/admin/withdrawals/${currentInspectId}/action`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, reason })
        });

        const data = await res.json();

        if (data.success) {
            closeModal();
            // Refresh list
            await fetchWithdrawals();
            await fetchStats();
            // alert('Success: ' + data.message);
        } else {
            alert('Error: ' + data.error);
        }
    } catch (e) {
        alert('Network Error');
    } finally {
        btn.innerHTML = originalText;
    }
}
