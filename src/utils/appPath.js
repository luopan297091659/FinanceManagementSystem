const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

const configuredEntryPath = trimTrailingSlash(import.meta.env?.VITE_APP_ENTRY_PATH);
const buildBasePath = trimTrailingSlash(import.meta.env?.BASE_URL);
const productionBasePath = typeof window !== 'undefined'
  && /^(www\.)?kotabi\.top$/i.test(window.location.hostname)
  ? '/finance'
  : '';

export const APP_BASE_PATH = configuredEntryPath
  || buildBasePath
  || productionBasePath;

export const APP_ENTRY_PATH = APP_BASE_PATH ? `${APP_BASE_PATH}/` : '/';

export function appPath(route = '/') {
  const normalizedRoute = `/${String(route || '/').replace(/^\/+/, '')}`;
  return APP_BASE_PATH ? `${APP_BASE_PATH}${normalizedRoute}` : normalizedRoute;
}
