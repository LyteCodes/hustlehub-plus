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

export const income = () => api.get("/income").then(unwrap);

export const incomeSummary = async () => {
    const res = await api.get("/me/income-summary").then(unwrap);
    // mock returns { freelancerId, generatedAt, summary } at top level
    // component expects { summary: [...] }
    if (res?.summary) return res;
    return res;
};