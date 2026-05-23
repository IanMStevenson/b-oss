// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BlipfotoClient,
  BlipfotoError,
  type EntryResponse,
  type JournalEntriesResponse,
  type UserProfileResponse,
} from '@b-oss/blipfoto-api';
import { BackupEngine } from '../backup-engine.js';
import { CheckpointManager } from '../checkpoint.js';
import { JournalIndex } from '../journal-index.js';
import { LogManager } from '../log-manager.js';
import type { PlatformIO } from '../platform.js';
import type {
  AccountBackupConfig,
  BackupCheckpoint,
  BackupEvent,
  BlipEntry,
  JournalMetadata,
  LogEntry,
} from '../types.js';

class MockPlatformIO implements PlatformIO {
  files = new Map<string, string>();
  downloads: Array<{ url: string; destPath: string }> = [];
  logs: Array<{ level: string; message: string; accountId: string }> = [];

  readFile(path: string): Promise<Buffer> {
    const content = this.files.get(path);
    if (content === undefined) {
      return Promise.reject(new Error(`File not found: ${path}`));
    }
    return Promise.resolve(Buffer.from(content));
  }
  writeFile(path: string, data: Buffer | string): Promise<void> {
    this.files.set(path, typeof data === 'string' ? data : data.toString());
    return Promise.resolve();
  }
  ensureDir(_path: string): Promise<void> {
    return Promise.resolve();
  }
  fileExists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }
  listDir(_path: string): Promise<string[]> {
    return Promise.resolve([]);
  }
  deleteFile(path: string): Promise<void> {
    this.files.delete(path);
    return Promise.resolve();
  }
  downloadFile(url: string, destPath: string): Promise<void> {
    this.downloads.push({ url, destPath });
    this.files.set(destPath, `<image:${url}>`);
    return Promise.resolve();
  }
  log(level: 'info' | 'warn' | 'error', message: string, accountId: string): void {
    this.logs.push({ level, message, accountId });
  }
}

function makeConfig(overrides: Partial<AccountBackupConfig> = {}): AccountBackupConfig {
  return {
    id: 'acct-1',
    username: 'gbradley',
    journal_title: 'Initial title',
    avatar_url: 'https://example.com/a.jpg',
    access_token: 'token',
    backup_folder: '/backups',
    redo_count: 7,
    gap_check_days: 31,
    api_delay_ms: 0,
    app_version: '0.1.0',
    ...overrides,
  };
}

function makeEntryStub(idStr: string, date: string) {
  return {
    entry_id_str: idStr,
    date,
    date_stamp: 0,
    title: `Entry ${date}`,
    username: 'gbradley',
    location: null,
    thumbnail_url: `https://example.com/${idStr}-t.jpg`,
    image_url: `https://example.com/${idStr}.jpg`,
  };
}

function makeEntryResponse(idStr: string, date: string): EntryResponse {
  return {
    entry: {
      ...makeEntryStub(idStr, date),
      details: {
        journal_title: 'Journal',
        description: 'desc',
        description_html: '<p>desc</p>',
        tags: [],
        views: { total: 1 },
        stars: { total: 0, starred: 0 },
        favorites: { total: 0, favorited: 0 },
      },
      metadata: {
        Make: null,
        Model: null,
        ExposureTime: null,
        FNumber: null,
        FocalLength: null,
        ISO: null,
        camera: null,
      },
      comments: { total: 0, list: [] },
      image_urls: {
        lores: `https://s3/${idStr}-t.jpg`,
        stdres: null,
        hires: null,
        original: `https://s3/${idStr}.jpg`,
      },
    },
  };
}

function makeClient(): BlipfotoClient {
  return new BlipfotoClient('test-token', 'https://api.blipfoto.com/4/');
}

function makeProfileResponse(entryTotal: number): UserProfileResponse {
  return {
    user: { username: 'gbradley', avatar_url: 'a', icons: [] },
    visibility: 1,
    details: {
      journal_title: 'Journal',
      biography: '',
      biography_html: '',
      country_code: 'GB',
      entry_total: entryTotal,
      member: 1,
      privacy: 0,
    },
  };
}

describe('JournalIndex', () => {
  it('entryJsonPath returns entries/YYYY/YYYY-MM-DD.json', () => {
    expect(JournalIndex.entryJsonPath('2024-01-15')).toBe('entries/2024/2024-01-15.json');
  });

  it('entryThumbnailPath returns entries/YYYY/YYYY-MM-DD-t.jpg', () => {
    expect(JournalIndex.entryThumbnailPath('2023-12-31')).toBe('entries/2023/2023-12-31-t.jpg');
  });

  it('save() writes journal.json with entries sorted newest-first', async () => {
    const io = new MockPlatformIO();
    const index = new JournalIndex(io, '/journal');
    const metadata: JournalMetadata = {
      schema_version: 1,
      username: 'u',
      journal_title: 't',
      avatar_url: 'a',
      entry_total: 3,
      last_backup_at: '2024-01-15T00:00:00Z',
      entries: [
        { entry_id: '1', date: '2024-01-01', title: 'old', thumbnail_path: '', json_path: '' },
        { entry_id: '3', date: '2024-03-01', title: 'new', thumbnail_path: '', json_path: '' },
        { entry_id: '2', date: '2024-02-01', title: 'mid', thumbnail_path: '', json_path: '' },
      ],
    };
    await index.save(metadata);
    const json = io.files.get('/journal/journal.json');
    expect(json).toBeDefined();
    const parsed = JSON.parse(json!) as JournalMetadata;
    expect(parsed.entries.map((e) => e.date)).toEqual(['2024-03-01', '2024-02-01', '2024-01-01']);
  });
});

describe('CheckpointManager', () => {
  it('load() returns null when no checkpoint file exists', async () => {
    const io = new MockPlatformIO();
    const mgr = new CheckpointManager(io, '/j');
    expect(await mgr.load()).toBeNull();
  });

  it('save() then load() round-trips correctly', async () => {
    const io = new MockPlatformIO();
    const mgr = new CheckpointManager(io, '/j');
    const cp: BackupCheckpoint = {
      started_at: '2024-01-01T00:00:00Z',
      last_page_index: 2,
      fetched_entry_ids: ['a'],
      total_to_fetch: 2,
    };
    await mgr.save(cp);
    const loaded = await mgr.load();
    expect(loaded).toEqual(cp);
  });

  it('clear() deletes the file; subsequent load() returns null', async () => {
    const io = new MockPlatformIO();
    const mgr = new CheckpointManager(io, '/j');
    const cp: BackupCheckpoint = {
      started_at: '2024-01-01T00:00:00Z',
      last_page_index: 0,
      fetched_entry_ids: [],
      total_to_fetch: 0,
    };
    await mgr.save(cp);
    expect(await mgr.load()).not.toBeNull();
    await mgr.clear();
    expect(await mgr.load()).toBeNull();
  });
});

describe('LogManager', () => {
  function entry(id: string, message: string): LogEntry {
    return {
      id,
      account_id: 'acct',
      timestamp: '2024-01-01T00:00:00Z',
      level: 'info',
      message,
    };
  }

  it('append() + readAll() returns the appended entries', async () => {
    const io = new MockPlatformIO();
    const mgr = new LogManager(io, '/j');
    await mgr.append(entry('1', 'a'));
    await mgr.append(entry('2', 'b'));
    const read = await mgr.readAll();
    expect(read.map((e) => e.message)).toEqual(['a', 'b']);
  });

  it('trim(2) on a 5-entry log keeps only the 2 most recent entries', async () => {
    const io = new MockPlatformIO();
    const mgr = new LogManager(io, '/j');
    for (let i = 1; i <= 5; i++) {
      await mgr.append(entry(String(i), `msg${i}`));
    }
    await mgr.trim(2);
    const read = await mgr.readAll();
    expect(read.map((e) => e.message)).toEqual(['msg4', 'msg5']);
  });

  it('readAll() returns [] when the log file is absent', async () => {
    const io = new MockPlatformIO();
    const mgr = new LogManager(io, '/j');
    expect(await mgr.readAll()).toEqual([]);
  });
});

describe('BackupEngine — first backup', () => {
  let io: MockPlatformIO;
  let client: BlipfotoClient;
  let events: BackupEvent[];

  beforeEach(() => {
    io = new MockPlatformIO();
    client = makeClient();
    events = [];
  });

  it('interleaves list + fetch across 2 pages, writes JSON, writes journal.json, deletes checkpoint', async () => {
    const page0: JournalEntriesResponse = {
      page: { index: 0, size: 100, more: 1 },
      entries: [makeEntryStub('111', '2024-01-15')],
    };
    const page1: JournalEntriesResponse = {
      page: { index: 1, size: 100, more: 0 },
      entries: [makeEntryStub('222', '2024-01-14')],
    };
    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(2));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValueOnce(page0).mockResolvedValueOnce(page1);
    vi.spyOn(client, 'getEntry').mockImplementation((id: string) =>
      Promise.resolve(makeEntryResponse(id, id === '111' ? '2024-01-15' : '2024-01-14')),
    );

    const engine = new BackupEngine(makeConfig(), io, client, (e) => events.push(e));
    await engine.run();

    expect(io.files.has('/backups/gbradley/entries/2024/2024-01-15.json')).toBe(true);
    expect(io.files.has('/backups/gbradley/entries/2024/2024-01-14.json')).toBe(true);
    expect(io.files.has('/backups/gbradley/journal.json')).toBe(true);
    expect(io.files.has('/backups/gbradley/_checkpoint.json')).toBe(false);
    expect(io.downloads.some((d) => d.destPath.endsWith('2024-01-15.jpg'))).toBe(true);

    const started = events.find((e) => e.type === 'started');
    expect(started).toBeDefined();
    if (started && started.type === 'started') {
      expect(started.total_to_fetch).toBe(2);
    }
  });

  it('emits started then 2 × progress then completed', async () => {
    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(2));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValueOnce({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('111', '2024-01-15'), makeEntryStub('222', '2024-01-14')],
    });
    vi.spyOn(client, 'getEntry').mockImplementation((id: string) =>
      Promise.resolve(makeEntryResponse(id, id === '111' ? '2024-01-15' : '2024-01-14')),
    );

    const engine = new BackupEngine(makeConfig(), io, client, (e) => events.push(e));
    await engine.run();

    const types = events.map((e) => e.type);
    expect(types).toEqual(['started', 'progress', 'progress', 'completed']);
  });

  it('emits failed { kind: auth_expired } and throws when first call returns BlipfotoError(51)', async () => {
    vi.spyOn(client, 'getUserProfile').mockRejectedValueOnce(
      new BlipfotoError(51, 'Token invalid'),
    );

    const engine = new BackupEngine(makeConfig(), io, client, (e) => events.push(e));
    await expect(engine.run()).rejects.toThrow();

    const failed = events.find((e) => e.type === 'failed');
    expect(failed).toBeDefined();
    if (failed && failed.type === 'failed') {
      expect(failed.error.kind).toBe('auth_expired');
    }
  });

  it('bumps total_to_fetch when more entries arrive than entry_total reported (drift)', async () => {
    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(2));
    vi.spyOn(client, 'getJournalEntries')
      .mockResolvedValueOnce({
        page: { index: 0, size: 100, more: 1 },
        entries: [makeEntryStub('111', '2024-01-15'), makeEntryStub('222', '2024-01-14')],
      })
      .mockResolvedValueOnce({
        page: { index: 1, size: 100, more: 0 },
        entries: [makeEntryStub('333', '2024-01-13')],
      });
    vi.spyOn(client, 'getEntry').mockImplementation((id: string) => {
      const date = id === '111' ? '2024-01-15' : id === '222' ? '2024-01-14' : '2024-01-13';
      return Promise.resolve(makeEntryResponse(id, date));
    });

    const engine = new BackupEngine(makeConfig(), io, client, (e) => events.push(e));
    await engine.run();

    const progressEvents = events.filter((e) => e.type === 'progress');
    for (const e of progressEvents) {
      if (e.type === 'progress') {
        expect(e.done).toBeLessThanOrEqual(e.total);
      }
    }
    const last = progressEvents[progressEvents.length - 1];
    if (last && last.type === 'progress') {
      expect(last.total).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('BackupEngine — resume interrupted first backup', () => {
  it('resumes from saved last_page_index and skips already-fetched entries; does not re-call getUserProfile', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();

    const cp: BackupCheckpoint = {
      started_at: '2024-01-01T00:00:00Z',
      last_page_index: 0,
      fetched_entry_ids: ['111'],
      total_to_fetch: 2,
    };
    io.files.set('/backups/gbradley/_checkpoint.json', JSON.stringify(cp));

    const profileSpy = vi.spyOn(client, 'getUserProfile');
    vi.spyOn(client, 'getJournalEntries').mockResolvedValueOnce({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('111', '2024-01-15'), makeEntryStub('222', '2024-01-14')],
    });
    const getEntrySpy = vi
      .spyOn(client, 'getEntry')
      .mockImplementation((id: string) =>
        Promise.resolve(makeEntryResponse(id, id === '111' ? '2024-01-15' : '2024-01-14')),
      );

    const engine = new BackupEngine(makeConfig(), io, client, () => {});
    await engine.run();

    expect(getEntrySpy).toHaveBeenCalledTimes(1);
    expect(getEntrySpy).toHaveBeenCalledWith('222', expect.any(Object));
    expect(profileSpy).not.toHaveBeenCalled();
  });
});

describe('BackupEngine — cancellation', () => {
  it('cancel() after first fetch stops before second', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    const events: BackupEvent[] = [];

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(2));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValueOnce({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('111', '2024-01-15'), makeEntryStub('222', '2024-01-14')],
    });

    let callCount = 0;
    const engine = new BackupEngine(makeConfig(), io, client, (e) => events.push(e));
    vi.spyOn(client, 'getEntry').mockImplementation((id: string) => {
      callCount++;
      if (callCount === 1) {
        engine.cancel();
      }
      return Promise.resolve(makeEntryResponse(id, id === '111' ? '2024-01-15' : '2024-01-14'));
    });

    await expect(engine.run()).rejects.toThrow();
    expect(callCount).toBe(1);
    expect(io.files.has('/backups/gbradley/entries/2024/2024-01-15.json')).toBe(true);
    expect(io.files.has('/backups/gbradley/entries/2024/2024-01-14.json')).toBe(false);
  });
});

describe('BackupEngine — consecutive failures', () => {
  it('three consecutive non-rate-limit BlipfotoError(202) failures emit failed and abort', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    const events: BackupEvent[] = [];

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(3));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValueOnce({
      page: { index: 0, size: 100, more: 0 },
      entries: [
        makeEntryStub('111', '2024-01-15'),
        makeEntryStub('222', '2024-01-14'),
        makeEntryStub('333', '2024-01-13'),
      ],
    });
    vi.spyOn(client, 'getEntry').mockRejectedValue(new BlipfotoError(202, 'Generic API error'));

    const engine = new BackupEngine(makeConfig(), io, client, (e) => events.push(e));
    await expect(engine.run()).rejects.toThrow();

    const failed = events.find((e) => e.type === 'failed');
    expect(failed).toBeDefined();
    if (failed && failed.type === 'failed') {
      expect(failed.error.kind).toBe('api_error');
    }
  });
});

describe('BackupEngine — rate limiting is a pause not a failure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('one rate-limit then success: emits one rate_limited event, then proceeds', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    const events: BackupEvent[] = [];

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValueOnce({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('111', '2024-01-15')],
    });
    let calls = 0;
    vi.spyOn(client, 'getEntry').mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.reject(new BlipfotoError(11, 'Rate limited'));
      return Promise.resolve(makeEntryResponse('111', '2024-01-15'));
    });

    const engine = new BackupEngine(makeConfig(), io, client, (e) => events.push(e));
    const runPromise = engine.run();
    await vi.runAllTimersAsync();
    await runPromise;

    expect(events.filter((e) => e.type === 'rate_limited').length).toBe(1);
    expect(events.some((e) => e.type === 'failed')).toBe(false);
    expect(events.some((e) => e.type === 'completed')).toBe(true);
    expect(io.files.has('/backups/gbradley/entries/2024/2024-01-15.json')).toBe(true);
  });

  it('three rate-limits then success: emits three rate_limited events, no failed', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    const events: BackupEvent[] = [];

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValueOnce({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('111', '2024-01-15')],
    });
    let calls = 0;
    vi.spyOn(client, 'getEntry').mockImplementation(() => {
      calls++;
      if (calls <= 3) return Promise.reject(new BlipfotoError(11, 'Rate limited'));
      return Promise.resolve(makeEntryResponse('111', '2024-01-15'));
    });

    const engine = new BackupEngine(makeConfig(), io, client, (e) => events.push(e));
    const runPromise = engine.run();
    await vi.runAllTimersAsync();
    await runPromise;

    expect(events.filter((e) => e.type === 'rate_limited').length).toBe(3);
    expect(events.some((e) => e.type === 'failed')).toBe(false);
    expect(events.some((e) => e.type === 'completed')).toBe(true);
  });
});

describe('BackupEngine — routine backup redo', () => {
  it('with existing journal.json of 3 entries and redo_count=2, re-fetches only the 2 most recent', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();

    const existing: JournalMetadata = {
      schema_version: 1,
      username: 'gbradley',
      journal_title: 't',
      avatar_url: 'a',
      entry_total: 3,
      last_backup_at: '2024-01-01T00:00:00Z',
      entries: [
        {
          entry_id: '333',
          date: '2024-01-15',
          title: 'newest',
          thumbnail_path: 'entries/2024/2024-01-15-t.jpg',
          json_path: 'entries/2024/2024-01-15.json',
        },
        {
          entry_id: '222',
          date: '2024-01-14',
          title: 'middle',
          thumbnail_path: 'entries/2024/2024-01-14-t.jpg',
          json_path: 'entries/2024/2024-01-14.json',
        },
        {
          entry_id: '111',
          date: '2024-01-13',
          title: 'oldest',
          thumbnail_path: 'entries/2024/2024-01-13-t.jpg',
          json_path: 'entries/2024/2024-01-13.json',
        },
      ],
    };
    io.files.set('/backups/gbradley/journal.json', JSON.stringify(existing));
    // Pre-seed image files so the image-repair pass doesn't re-download them.
    for (const e of existing.entries) {
      io.files.set(`/backups/gbradley/entries/2024/${e.date}.jpg`, '<placeholder>');
    }

    const profile: UserProfileResponse = {
      user: { username: 'gbradley', avatar_url: 'a', icons: [] },
      visibility: 1,
      details: {
        journal_title: 't',
        biography: '',
        biography_html: '',
        country_code: 'GB',
        entry_total: 3,
        member: 1,
        privacy: 0,
      },
    };
    vi.spyOn(client, 'getUserProfile').mockResolvedValue(profile);
    // For gap fill discovery — return no new dates
    vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [],
    });
    const getEntrySpy = vi.spyOn(client, 'getEntry').mockImplementation((id: string) => {
      const e = existing.entries.find((x) => x.entry_id === id);
      return Promise.resolve(makeEntryResponse(id, e!.date));
    });

    const engine = new BackupEngine(makeConfig({ redo_count: 2 }), io, client, () => {});
    await engine.run();

    const ids = getEntrySpy.mock.calls.map((c) => c[0]);
    expect(ids).toEqual(['333', '222']);
  });
});

// Plain BlipEntry mapping check — verifies the engine writes a recognisable schema
describe('BackupEngine — writes BlipEntry schema', () => {
  it('writes JSON with entry_id (string), schema_version 1, images.original set', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValueOnce({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('111', '2024-01-15')],
    });
    vi.spyOn(client, 'getEntry').mockResolvedValue(makeEntryResponse('111', '2024-01-15'));

    const engine = new BackupEngine(makeConfig(), io, client, () => {});
    await engine.run();

    const raw = io.files.get('/backups/gbradley/entries/2024/2024-01-15.json');
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!) as BlipEntry;
    expect(parsed.entry_id).toBe('111');
    expect(typeof parsed.entry_id).toBe('string');
    expect(parsed.schema_version).toBe(1);
    expect(parsed.images.original).toBe('entries/2024/2024-01-15.jpg');
    expect(parsed.images.thumbnail).toBe('entries/2024/2024-01-15-t.jpg');
    expect(parsed.backup_app_version).toBe('0.1.0');
  });
});
