import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("tb_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function formatApiError(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || "Errore sconosciuto";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((x) => (x?.msg ? x.msg : JSON.stringify(x))).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}
