import { MediaAsset, Project, LiveIngestionEvent } from '../types';

/**
 * The app starts empty. Every count, bucket and notification is derived from
 * real media the user ingests — nothing is seeded, so a fresh catalog reads
 * zero across the board until something is actually added.
 */
export const INITIAL_PROJECTS: Project[] = [];

export const INITIAL_ASSETS: MediaAsset[] = [];

export const INITIAL_LIVE_EVENTS: LiveIngestionEvent[] = [];
