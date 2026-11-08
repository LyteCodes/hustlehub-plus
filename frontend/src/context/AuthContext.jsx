import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as authApi from "../api/auth";
import { getToken, setToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(Boolean(getToken()));

    useEffect(() => {
        if (!getToken()) return;
        let cancelled = false;
        authApi.me()
            .then((res) => {
                // me() calls unwrap → res is { data: { id, name, email, role } }
                // so we need res.data to get the actual user object
                if (!cancelled) setUser(res.data ?? res);
            })
            .catch(() => setToken(null))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const onExpired = () => setUser(null);
        window.addEventListener("auth:expired", onExpired);
        return () => window.removeEventListener("auth:expired", onExpired);
    }, []);

    const login = useCallback(async (credentials) => {
        const res = await authApi.login(credentials);
        // login() calls unwrap → res is { data: { token, user } }
        const payload = res.data ?? res;
        setToken(payload.token);
        setUser(payload.user);
        return payload.user;
    }, []);

    const register = useCallback(async (payload) => {
        await authApi.register(payload);
        const res = await authApi.login({ email: payload.email, password: payload.password });
        const data = res.data ?? res;
        setToken(data.token);
        setUser(data.user);
        return data.user;
    }, []);

    const logout = useCallback(() => { setToken(null); setUser(null); }, []);

    const value = useMemo(
        () => ({ user, loading, isAuthenticated: Boolean(user), login, register, logout }),
        [user, loading, login, register, logout]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}