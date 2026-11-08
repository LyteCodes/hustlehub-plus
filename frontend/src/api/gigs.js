import { api, unwrap } from "./client";

// GET /api/gigs — backend returns a raw array, pages need { data, meta }
export const listGigs = async (params) => {
    const res = await api.get("/gigs", { params }).then(unwrap);
    // Backend returns raw array with no pagination wrapper
    if (Array.isArray(res)) {
        return { data: res, meta: { page: 1, limit: res.length, total: res.length, pages: 1 } };
    }
    // Already shaped correctly
    return res;
};

export const gigCategories = (params) => api.get("/gigs/categories", { params }).then(unwrap);
export const getGig = (id) => api.get(`/gigs/${id}`).then(unwrap);

// GET /api/gigs/mine — backend returns { gigs: [...] }
export const myGigs = async () => {
    const res = await api.get("/gigs/mine").then(unwrap);
    // Normalise to { data: [...] } which pages expect
    if (res?.gigs) return { data: res.gigs };
    return res;
};

export const createGig = (payload) => api.post("/gigs", payload).then(unwrap);
export const updateGig = (id, payload) => api.put(`/gigs/${id}`, payload).then(unwrap);
export const setGigStatus = (id, status) => api.patch(`/gigs/${id}/status`, { status }).then(unwrap);
export const deleteGig = (id) => api.delete(`/gigs/${id}`).then(unwrap);