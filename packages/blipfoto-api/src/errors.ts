// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export class BlipfotoError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'BlipfotoError';
  }

  get isTokenInvalid(): boolean {
    return this.code === 51 || this.code === 50;
  }

  get isRateLimited(): boolean {
    return this.code === 11;
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}
