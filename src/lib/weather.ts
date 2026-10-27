// Погода Open-Meteo (CC BY 4.0) с фолбэком на public/data/weather_*.json. Владелец — data-engineer.
import type { AggregateMonthly, FetchArchive, FetchForecast } from '../types';
import { notImplemented } from './todo';

const OWNER = 'data-engineer';

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

export const fetchForecast: FetchForecast = () => notImplemented(OWNER, 'fetchForecast');
export const fetchArchive: FetchArchive = () => notImplemented(OWNER, 'fetchArchive');
export const aggregateMonthly: AggregateMonthly = () => notImplemented(OWNER, 'aggregateMonthly');
