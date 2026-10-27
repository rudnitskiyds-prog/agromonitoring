// Загрузка рядов из public/data. Владелец — data-engineer.
import type { LoadManifest, LoadSeries, SeriesFileName, SourceOf } from '../types';
import { notImplemented } from './todo';

const OWNER = 'data-engineer';

export const seriesFileName: SeriesFileName = ({ indicator, region, crop, frequency }) =>
  `${indicator}_${region}${crop ? `_${crop}` : ''}_${frequency}.json`;

export const loadSeries: LoadSeries = () => notImplemented(OWNER, 'loadSeries');
export const loadManifest: LoadManifest = () => notImplemented(OWNER, 'loadManifest');

export const sourceOf: SourceOf = ({ source, source_url, updated_at, demo }) => ({ source, source_url, updated_at, demo });
