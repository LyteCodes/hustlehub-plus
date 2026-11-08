import { api, unwrap } from "./client";

export const createBooking = (payload) => api.post("/bookings", payload).then(unwrap);
export const getBooking = (id) => api.get(`/bookings/${id}`).then(unwrap);

export const myBookings = async (params) => {
    const res = await api.get("/bookings/mine", { params }).then(unwrap);
    if (res?.bookings) return { data: res.bookings, meta: { page: 1, limit: res.bookings.length, total: res.bookings.length, totalPages: 1 } };
    return res;
};

export const incomingBookings = (params) => api.get("/bookings/incoming", { params }).then(unwrap);
export const setBookingStatus = (id, status) => api.patch(`/bookings/${id}/status`, { status }).then(unwrap);
export const myTransactions = (params) => api.get("/transactions/mine", { params }).then(unwrap);

export const income = async () => {
    const res = await api.get("/transactions/income").then(unwrap);
    const txs = Array.isArray(res?.transactions) ? res.transactions : [];
    const completed = txs.filter(t => t.status === "Completed");
    const pending = txs.filter(t => t.status === "Pending");
    const months = new Map();
    for (const t of completed) {
        const key = String(t.createdAt || "").slice(0, 7);
        if (key.length < 7) continue;
        const m = months.get(key) || { month: key, count: 0, amount: 0 };
        m.count += 1;
        m.amount += Number(t.amount) || 0;
        months.set(key, m);
    }
    return {
        data: {
            totalEarned: res?.totalIncome ?? 0,
            completedCount: completed.length,
            pendingCount: pending.length,
            byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
            recent: txs.slice(0, 10),
        }
    };
};

export const incomeSummary = () => api.get("/me/income-summary").then(unwrap);