// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BlipfotoClient,
  BlipfotoError,
  type EntryResponse,
  type JournalEntriesResponse,
  type UserProfileResponse,
} from '@b-oss/b-api';
import { BackupEngine } from '../backup-engine.js';
import { CheckpointManager } from '../checkpoint.js';
import { JournalIndex, cacheAvatarIfMissing, AVATAR_FILENAME } from '../journal-index.js';
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
  renames: Array<{ from: string; to: string }> = [];
  logs: Array<LogEntry> = [];

  readFile(path: string): Promise<Uint8Array> {
    const content = this.files.get(path);
    if (content === undefined) {
      return Promise.reject(new Error(`File not found: ${path}`));
    }
    return Promise.resolve(new TextEncoder().encode(content));
  }
  writeFile(path: string, data: Uint8Array | string): Promise<void> {
    this.files.set(path, typeof data === 'string' ? data : new TextDecoder().decode(data));
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
  rename(from: string, to: string): Promise<void> {
    const content = this.files.get(from);
    if (content === undefined) {
      return Promise.reject(new Error(`File not found: ${from}`));
    }
    this.files.set(to, content);
    this.files.delete(from);
    this.renames.push({ from, to });
    return Promise.resolve();
  }
  downloadFile(url: string, destPath: string): Promise<void> {
    this.downloads.push({ url, destPath });
    this.files.set(destPath, `<image:${url}>`);
    return Promise.resolve();
  }
  log(entry: LogEntry): void {
    this.logs.push(entry);
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

function makeEngine(
  config: AccountBackupConfig,
  io: MockPlatformIO,
  client: BlipfotoClient,
  onEvent: (event: BackupEvent) => void,
): BackupEngine {
  return new BackupEngine(config, io, client, onEvent, new LogManager(io, config.backup_folder));
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

function makeEntryResponse(
  idStr: string,
  date: string,
  imageUrlsOverride?: Partial<{
    lores: string | null;
    stdres: string | null;
    hires: string | null;
    original: string | null;
  }>,
): EntryResponse {
  return {
    entry: makeEntryStub(idStr, date),
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
      lores: null,
      stdres: null,
      hires: null,
      original: null,
      ...imageUrlsOverride,
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

    const engine = makeEngine(makeConfig(), io, client, (e) => events.push(e));
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

    const engine = makeEngine(makeConfig(), io, client, (e) => events.push(e));
    await engine.run();

    const types = events.map((e) => e.type);
    expect(types).toEqual(['started', 'progress', 'progress', 'completed']);
  });

  it('emits failed { kind: auth_expired } and throws when first call returns BlipfotoError(51)', async () => {
    vi.spyOn(client, 'getUserProfile').mockRejectedValueOnce(
      new BlipfotoError(51, 'Token invalid'),
    );

    const engine = makeEngine(makeConfig(), io, client, (e) => events.push(e));
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

    const engine = makeEngine(makeConfig(), io, client, (e) => events.push(e));
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

    const engine = makeEngine(makeConfig(), io, client, () => {});
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
    const engine = makeEngine(makeConfig(), io, client, (e) => events.push(e));
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

    const engine = makeEngine(makeConfig(), io, client, (e) => events.push(e));
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

    const engine = makeEngine(makeConfig(), io, client, (e) => events.push(e));
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

    const engine = makeEngine(makeConfig(), io, client, (e) => events.push(e));
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

    const engine = makeEngine(makeConfig({ redo_count: 2 }), io, client, () => {});
    await engine.run();

    const ids = getEntrySpy.mock.calls.map((c) => c[0]);
    expect(ids).toEqual(['333', '222']);
  });
});

describe('BackupEngine — routine backup new posts', () => {
  function seedJournal(io: MockPlatformIO, journal: JournalMetadata) {
    io.files.set('/backups/gbradley/journal.json', JSON.stringify(journal));
    for (const e of journal.entries) {
      const year = e.date.slice(0, 4);
      io.files.set(`/backups/gbradley/entries/${year}/${e.date}.jpg`, '<placeholder>');
    }
  }

  const baseJournal: JournalMetadata = {
    schema_version: 1,
    username: 'gbradley',
    journal_title: 't',
    avatar_url: 'a',
    entry_total: 1,
    last_backup_at: '2024-01-01T00:00:00Z',
    entries: [
      {
        entry_id: '100',
        date: '2024-01-15',
        title: 'most recent',
        thumbnail_path: 'entries/2024/2024-01-15-t.jpg',
        json_path: 'entries/2024/2024-01-15.json',
      },
    ],
  };

  it('fetches entries newer than mostRecentEntryDate in chronological order', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    seedJournal(io, baseJournal);

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(3));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [
        makeEntryStub('300', '2024-01-17'),
        makeEntryStub('200', '2024-01-16'),
        makeEntryStub('100', '2024-01-15'),
      ],
    });
    const dateMap: Record<string, string> = {
      '100': '2024-01-15',
      '200': '2024-01-16',
      '300': '2024-01-17',
    };
    const getEntrySpy = vi
      .spyOn(client, 'getEntry')
      .mockImplementation((id: string) => Promise.resolve(makeEntryResponse(id, dateMap[id])));

    const engine = makeEngine(makeConfig({ redo_count: 1 }), io, client, () => {});
    await engine.run();

    expect(getEntrySpy.mock.calls.map((c) => c[0])).toEqual(['100', '200', '300']);
    const journal = JSON.parse(io.files.get('/backups/gbradley/journal.json')!) as JournalMetadata;
    expect(journal.entries.map((e) => e.date)).toEqual(['2024-01-17', '2024-01-16', '2024-01-15']);
    expect(io.files.has('/backups/gbradley/entries/2024/2024-01-16.json')).toBe(true);
    expect(io.files.has('/backups/gbradley/entries/2024/2024-01-17.json')).toBe(true);
  });

  it('with no new posts, makes one page call and adds no new entries', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    seedJournal(io, baseJournal);

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    const pageSpy = vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('100', '2024-01-15')],
    });
    const getEntrySpy = vi
      .spyOn(client, 'getEntry')
      .mockImplementation((id: string) => Promise.resolve(makeEntryResponse(id, '2024-01-15')));

    const engine = makeEngine(makeConfig({ redo_count: 1 }), io, client, () => {});
    await engine.run();

    expect(pageSpy).toHaveBeenCalledTimes(1);
    expect(getEntrySpy.mock.calls.map((c) => c[0])).toEqual(['100']);
    const journal = JSON.parse(io.files.get('/backups/gbradley/journal.json')!) as JournalMetadata;
    expect(journal.entries).toHaveLength(1);
  });

  it('paginates across multiple pages until oldestOnPage <= mostRecentEntryDate', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    seedJournal(io, baseJournal);

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(5));
    const pageSpy = vi
      .spyOn(client, 'getJournalEntries')
      .mockResolvedValueOnce({
        page: { index: 0, size: 100, more: 1 },
        entries: [makeEntryStub('400', '2024-01-19'), makeEntryStub('300', '2024-01-18')],
      })
      .mockResolvedValueOnce({
        page: { index: 1, size: 100, more: 1 },
        entries: [
          makeEntryStub('200', '2024-01-17'),
          makeEntryStub('150', '2024-01-16'),
          makeEntryStub('100', '2024-01-15'),
        ],
      });
    const dateMap: Record<string, string> = {
      '100': '2024-01-15',
      '150': '2024-01-16',
      '200': '2024-01-17',
      '300': '2024-01-18',
      '400': '2024-01-19',
    };
    const getEntrySpy = vi
      .spyOn(client, 'getEntry')
      .mockImplementation((id: string) => Promise.resolve(makeEntryResponse(id, dateMap[id])));

    const engine = makeEngine(makeConfig({ redo_count: 1 }), io, client, () => {});
    await engine.run();

    expect(pageSpy).toHaveBeenCalledTimes(2);
    expect(getEntrySpy.mock.calls.map((c) => c[0])).toEqual(['100', '150', '200', '300', '400']);
  });

  it('three consecutive new-post fetch failures abort with BackupAbortedError', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    seedJournal(io, baseJournal);

    const events: BackupEvent[] = [];
    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(4));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [
        makeEntryStub('400', '2024-01-19'),
        makeEntryStub('300', '2024-01-18'),
        makeEntryStub('200', '2024-01-17'),
        makeEntryStub('100', '2024-01-15'),
      ],
    });
    let newPostFails = 0;
    vi.spyOn(client, 'getEntry').mockImplementation((id: string) => {
      if (id === '100') return Promise.resolve(makeEntryResponse('100', '2024-01-15'));
      newPostFails++;
      return Promise.reject(new BlipfotoError(202, 'Generic API error'));
    });

    const engine = makeEngine(makeConfig({ redo_count: 1 }), io, client, (e) => events.push(e));
    await expect(engine.run()).rejects.toThrow();

    expect(newPostFails).toBe(3);
    const failed = events.find((e) => e.type === 'failed');
    expect(failed).toBeDefined();
    if (failed && failed.type === 'failed') {
      expect(failed.error.kind).toBe('api_error');
    }
  });

  it('saves journal.json after each new-post fetch (not just at the end)', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    seedJournal(io, baseJournal);

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(4));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [
        makeEntryStub('300', '2024-01-18'),
        makeEntryStub('200', '2024-01-17'),
        makeEntryStub('150', '2024-01-16'),
        makeEntryStub('100', '2024-01-15'),
      ],
    });
    const dateMap: Record<string, string> = {
      '100': '2024-01-15',
      '150': '2024-01-16',
      '200': '2024-01-17',
      '300': '2024-01-18',
    };
    vi.spyOn(client, 'getEntry').mockImplementation((id: string) =>
      Promise.resolve(makeEntryResponse(id, dateMap[id])),
    );

    const engine = makeEngine(makeConfig({ redo_count: 1 }), io, client, () => {});
    await engine.run();

    // journal.json is written via writeFile-to-tmp + rename, so each rename
    // to the final journal.json path counts as one save. Expected:
    //   1 redo + 3 new-posts + 1 final = 5 saves at minimum.
    const journalRenames = io.renames.filter((r) => r.to === '/backups/gbradley/journal.json');
    expect(journalRenames.length).toBeGreaterThanOrEqual(5);
  });

  it('cancel() during new-posts stops further entries from being written', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    seedJournal(io, baseJournal);

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(3));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [
        makeEntryStub('300', '2024-01-17'),
        makeEntryStub('200', '2024-01-16'),
        makeEntryStub('100', '2024-01-15'),
      ],
    });
    const dateMap: Record<string, string> = {
      '100': '2024-01-15',
      '200': '2024-01-16',
      '300': '2024-01-17',
    };
    let newPostCalls = 0;
    const engine = makeEngine(makeConfig({ redo_count: 1 }), io, client, () => {});
    vi.spyOn(client, 'getEntry').mockImplementation((id: string) => {
      if (id === '100') return Promise.resolve(makeEntryResponse('100', '2024-01-15'));
      newPostCalls++;
      if (newPostCalls === 1) {
        engine.cancel();
      }
      return Promise.resolve(makeEntryResponse(id, dateMap[id]));
    });

    await expect(engine.run()).rejects.toThrow();
    expect(newPostCalls).toBe(1);
    expect(io.files.has('/backups/gbradley/entries/2024/2024-01-16.json')).toBe(true);
    expect(io.files.has('/backups/gbradley/entries/2024/2024-01-17.json')).toBe(false);
  });
});

describe('BackupEngine — phase events', () => {
  function seedBaseJournal(io: MockPlatformIO) {
    const journal: JournalMetadata = {
      schema_version: 1,
      username: 'gbradley',
      journal_title: 't',
      avatar_url: 'a',
      entry_total: 1,
      last_backup_at: '2024-01-01T00:00:00Z',
      entries: [
        {
          entry_id: '100',
          date: '2024-01-15',
          title: 'one',
          thumbnail_path: 'entries/2024/2024-01-15-t.jpg',
          json_path: 'entries/2024/2024-01-15.json',
        },
      ],
    };
    io.files.set('/backups/gbradley/journal.json', JSON.stringify(journal));
    io.files.set('/backups/gbradley/entries/2024/2024-01-15.jpg', '<placeholder>');
  }

  it('first backup emits started with kind="first" and progress with no phase', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    const events: BackupEvent[] = [];

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('111', '2024-01-15')],
    });
    vi.spyOn(client, 'getEntry').mockResolvedValue(makeEntryResponse('111', '2024-01-15'));

    await makeEngine(makeConfig(), io, client, (e) => events.push(e)).run();

    const started = events.find((e) => e.type === 'started');
    expect(started).toBeDefined();
    if (started && started.type === 'started') {
      expect(started.kind).toBe('first');
    }
    const progress = events.filter((e) => e.type === 'progress');
    expect(progress.length).toBeGreaterThan(0);
    for (const e of progress) {
      if (e.type === 'progress') {
        expect(e.phase).toBeUndefined();
      }
    }
  });

  it('routine backup emits started with kind="routine"', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    const events: BackupEvent[] = [];
    seedBaseJournal(io);

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('100', '2024-01-15')],
    });
    vi.spyOn(client, 'getEntry').mockResolvedValue(makeEntryResponse('100', '2024-01-15'));

    await makeEngine(makeConfig({ redo_count: 1 }), io, client, (e) => events.push(e)).run();

    const started = events.find((e) => e.type === 'started');
    if (started && started.type === 'started') {
      expect(started.kind).toBe('routine');
    } else {
      throw new Error('started event missing');
    }
  });

  it('routine backup emits at least one progress event for each phase, in order', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    const events: BackupEvent[] = [];
    seedBaseJournal(io);

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('100', '2024-01-15')],
    });
    vi.spyOn(client, 'getEntry').mockResolvedValue(makeEntryResponse('100', '2024-01-15'));

    await makeEngine(makeConfig({ redo_count: 1 }), io, client, (e) => events.push(e)).run();

    const phases = events
      .filter((e): e is Extract<BackupEvent, { type: 'progress' }> => e.type === 'progress')
      .map((e) => e.phase);

    expect(phases).toContain('redo');
    expect(phases).toContain('gap_fill');
    expect(phases).toContain('new_posts');
    expect(phases).toContain('image_repair');

    expect(phases.indexOf('redo')).toBeLessThan(phases.indexOf('gap_fill'));
    expect(phases.indexOf('gap_fill')).toBeLessThan(phases.indexOf('new_posts'));
    expect(phases.indexOf('new_posts')).toBeLessThan(phases.indexOf('image_repair'));
  });

  it('image-repair emits only the zero phase-entry event when no repairs needed', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    const events: BackupEvent[] = [];
    seedBaseJournal(io);

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('100', '2024-01-15')],
    });
    vi.spyOn(client, 'getEntry').mockResolvedValue(makeEntryResponse('100', '2024-01-15'));

    await makeEngine(makeConfig({ redo_count: 1 }), io, client, (e) => events.push(e)).run();

    const repairEvents = events.filter(
      (e): e is Extract<BackupEvent, { type: 'progress' }> =>
        e.type === 'progress' && e.phase === 'image_repair',
    );
    expect(repairEvents).toHaveLength(1);
    expect(repairEvents[0]?.done).toBe(0);
    expect(repairEvents[0]?.total).toBe(0);
  });

  it('image-repair emits one event per actual repair (plus the phase-entry zero)', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    const events: BackupEvent[] = [];

    // Two entries; second one's image is missing on disk.
    const journal: JournalMetadata = {
      schema_version: 1,
      username: 'gbradley',
      journal_title: 't',
      avatar_url: 'a',
      entry_total: 2,
      last_backup_at: '2024-01-01T00:00:00Z',
      entries: [
        {
          entry_id: '200',
          date: '2024-01-16',
          title: 'two',
          thumbnail_path: 'entries/2024/2024-01-16-t.jpg',
          json_path: 'entries/2024/2024-01-16.json',
        },
        {
          entry_id: '100',
          date: '2024-01-15',
          title: 'one',
          thumbnail_path: 'entries/2024/2024-01-15-t.jpg',
          json_path: 'entries/2024/2024-01-15.json',
        },
      ],
    };
    io.files.set('/backups/gbradley/journal.json', JSON.stringify(journal));
    // Pre-seed only '200's image — '100's is missing, triggering one repair.
    io.files.set('/backups/gbradley/entries/2024/2024-01-16.jpg', '<placeholder>');

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(2));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('200', '2024-01-16'), makeEntryStub('100', '2024-01-15')],
    });
    const dateMap: Record<string, string> = { '100': '2024-01-15', '200': '2024-01-16' };
    vi.spyOn(client, 'getEntry').mockImplementation((id: string) =>
      Promise.resolve(makeEntryResponse(id, dateMap[id])),
    );

    await makeEngine(makeConfig({ redo_count: 1 }), io, client, (e) => events.push(e)).run();

    const repairEvents = events.filter(
      (e): e is Extract<BackupEvent, { type: 'progress' }> =>
        e.type === 'progress' && e.phase === 'image_repair',
    );
    // Phase-entry zero, then one event for the one repair.
    expect(repairEvents.map((e) => `${e.done}/${e.total}`)).toEqual(['0/0', '1/1']);
  });

  it('routine backup with no new posts emits a single new_posts phase-entry event', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    const events: BackupEvent[] = [];
    seedBaseJournal(io);

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('100', '2024-01-15')],
    });
    vi.spyOn(client, 'getEntry').mockResolvedValue(makeEntryResponse('100', '2024-01-15'));

    await makeEngine(makeConfig({ redo_count: 1 }), io, client, (e) => events.push(e)).run();

    const newPostsEvents = events.filter(
      (e): e is Extract<BackupEvent, { type: 'progress' }> =>
        e.type === 'progress' && e.phase === 'new_posts',
    );
    expect(newPostsEvents).toHaveLength(1);
    expect(newPostsEvents[0]?.done).toBe(0);
    expect(newPostsEvents[0]?.total).toBe(0);
  });
});

describe('BackupEngine — entry replacement', () => {
  it('overwrites the existing date file (no -id suffix) when entry_id changes; logs info', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();

    // Old version of the entry — same date, different entry_id.
    const oldEntryPath = '/backups/gbradley/entries/2024/2024-03-15.json';
    const oldEntry: Partial<BlipEntry> = {
      schema_version: 1,
      entry_id: '111',
      date: '2024-03-15',
      title: 'old title',
    };
    io.files.set(oldEntryPath, JSON.stringify(oldEntry));

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValue({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('222', '2024-03-15')],
    });
    vi.spyOn(client, 'getEntry').mockResolvedValue(makeEntryResponse('222', '2024-03-15'));

    const engine = makeEngine(makeConfig(), io, client, () => {});
    await engine.run();

    // Only one JSON for the date — no -222-suffixed sibling.
    const datePaths = [...io.files.keys()].filter(
      (k) => k.startsWith('/backups/gbradley/entries/2024/2024-03-15') && k.endsWith('.json'),
    );
    expect(datePaths).toEqual([oldEntryPath]);

    // File now contains the new entry_id.
    const newContents = JSON.parse(io.files.get(oldEntryPath)!) as BlipEntry;
    expect(newContents.entry_id).toBe('222');

    // Journal index has exactly one row for that date, with the new id.
    const journal = JSON.parse(io.files.get('/backups/gbradley/journal.json')!) as JournalMetadata;
    const rows = journal.entries.filter((e) => e.date === '2024-03-15');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entry_id).toBe('222');

    // Info-level replacement log line recorded.
    const replaceLogs = io.logs.filter(
      (l) => l.level === 'info' && l.message.includes('Replacing entry for 2024-03-15'),
    );
    expect(replaceLogs).toHaveLength(1);
    expect(replaceLogs[0]?.message).toContain('111');
    expect(replaceLogs[0]?.message).toContain('222');
  });
});

// Plain BlipEntry mapping check — verifies the engine writes a recognisable schema
describe('BackupEngine — writes BlipEntry schema', () => {
  it('writes JSON with entry_id (string), schema_version 1, image+thumbnail downloaded from entry stub URLs', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();

    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValueOnce({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('111', '2024-01-15')],
    });
    vi.spyOn(client, 'getEntry').mockResolvedValue(makeEntryResponse('111', '2024-01-15'));

    const engine = makeEngine(makeConfig(), io, client, () => {});
    await engine.run();

    const raw = io.files.get('/backups/gbradley/entries/2024/2024-01-15.json');
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!) as BlipEntry;
    expect(parsed.entry_id).toBe('111');
    expect(typeof parsed.entry_id).toBe('string');
    expect(parsed.schema_version).toBe(1);
    expect(parsed.images.image).toBe('entries/2024/2024-01-15.jpg');
    expect(parsed.images.thumbnail).toBe('entries/2024/2024-01-15-t.jpg');
    expect(parsed.images.original).toBeUndefined();
    expect(parsed.images.hires).toBeUndefined();
    expect(parsed.backup_app_version).toBe('0.1.0');

    const urls = io.downloads
      .filter((d) => d.destPath.includes('/entries/'))
      .map((d) => d.url)
      .sort();
    expect(urls).toEqual(['https://example.com/111-t.jpg', 'https://example.com/111.jpg'].sort());
  });

  it('populates description, tags, views, comments, exif from sibling response sections', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValueOnce({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('222', '2024-02-20')],
    });
    const response = makeEntryResponse('222', '2024-02-20');
    response.details!.description = 'Stewed apple with grapes';
    response.details!.description_html = '<p>Stewed apple</p>';
    response.details!.tags = ['food', 'dessert'];
    response.details!.views.total = 258;
    response.details!.stars.total = 2;
    response.metadata!.Make = 'samsung';
    response.metadata!.camera = 'Samsung SM-N986B';
    response.comments!.total = 1;
    response.comments!.list = [
      {
        comment_id_str: '999',
        parent_id_str: null,
        entry_id_str: '222',
        thumbnail_url: 'https://example.com/c.jpg',
        content: 'Good colours',
        content_html: 'Good colours',
        commenter: { username: 'annejohn', avatar_url: 'https://example.com/a.jpg' },
        actions: { reply: 1 as const, edit: 0 as const, delete: 0 as const },
        replies: [],
      },
    ];
    vi.spyOn(client, 'getEntry').mockResolvedValue(response);

    const engine = makeEngine(makeConfig(), io, client, () => {});
    await engine.run();

    const parsed = JSON.parse(
      io.files.get('/backups/gbradley/entries/2024/2024-02-20.json')!,
    ) as BlipEntry;
    expect(parsed.description).toBe('Stewed apple with grapes');
    expect(parsed.tags).toEqual(['food', 'dessert']);
    expect(parsed.views_total).toBe(258);
    expect(parsed.stars_total).toBe(2);
    expect(parsed.comments).toHaveLength(1);
    expect(parsed.comments[0].content).toBe('Good colours');
    expect(parsed.exif?.camera).toBe('Samsung SM-N986B');
  });

  it('downloads original (-o.jpg) and hires (-h.jpg) when image_urls supplies them', async () => {
    const io = new MockPlatformIO();
    const client = makeClient();
    vi.spyOn(client, 'getUserProfile').mockResolvedValue(makeProfileResponse(1));
    vi.spyOn(client, 'getJournalEntries').mockResolvedValueOnce({
      page: { index: 0, size: 100, more: 0 },
      entries: [makeEntryStub('333', '2024-03-30')],
    });
    vi.spyOn(client, 'getEntry').mockResolvedValue(
      makeEntryResponse('333', '2024-03-30', {
        original: 'https://example.com/333-original.jpg',
        hires: 'https://example.com/333-hires.jpg',
      }),
    );

    const engine = makeEngine(makeConfig(), io, client, () => {});
    await engine.run();

    const parsed = JSON.parse(
      io.files.get('/backups/gbradley/entries/2024/2024-03-30.json')!,
    ) as BlipEntry;
    expect(parsed.images.thumbnail).toBe('entries/2024/2024-03-30-t.jpg');
    expect(parsed.images.image).toBe('entries/2024/2024-03-30.jpg');
    expect(parsed.images.original).toBe('entries/2024/2024-03-30-o.jpg');
    expect(parsed.images.hires).toBe('entries/2024/2024-03-30-h.jpg');

    const urls = io.downloads
      .filter((d) => d.destPath.includes('/entries/'))
      .map((d) => d.url)
      .sort();
    expect(urls).toEqual(
      [
        'https://example.com/333-hires.jpg',
        'https://example.com/333-original.jpg',
        'https://example.com/333-t.jpg',
        'https://example.com/333.jpg',
      ].sort(),
    );
  });
});

describe('cacheAvatarIfMissing', () => {
  const folder = '/backups/gbradley';
  const dest = `${folder}/${AVATAR_FILENAME}`;
  const url = 'https://example.com/avatar.jpg';

  it('skips when the URL is blank or whitespace', async () => {
    const io = new MockPlatformIO();
    await cacheAvatarIfMissing(io, folder, '');
    await cacheAvatarIfMissing(io, folder, '   ');
    expect(io.downloads).toHaveLength(0);
    expect(io.files.has(dest)).toBe(false);
  });

  it('downloads to <folder>/avatar.jpg when the file is missing', async () => {
    const io = new MockPlatformIO();
    await cacheAvatarIfMissing(io, folder, url);
    expect(io.downloads).toEqual([{ url, destPath: dest }]);
    expect(io.files.has(dest)).toBe(true);
  });

  it('does not download when the cache file already exists', async () => {
    const io = new MockPlatformIO();
    io.files.set(dest, '<existing avatar bytes>');
    await cacheAvatarIfMissing(io, folder, url);
    expect(io.downloads).toHaveLength(0);
    expect(io.files.get(dest)).toBe('<existing avatar bytes>');
  });

  it('swallows download errors without throwing', async () => {
    const io = new MockPlatformIO();
    io.downloadFile = () => Promise.reject(new Error('network blip'));
    await expect(cacheAvatarIfMissing(io, folder, url)).resolves.toBeUndefined();
    expect(io.files.has(dest)).toBe(false);
  });
});
