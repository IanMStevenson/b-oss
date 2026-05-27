// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import styles from './InfoPopup.module.css';

interface InfoPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InfoPopup({ isOpen, onClose }: InfoPopupProps) {
  if (!isOpen) return null;

  const year = new Date().getFullYear();

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className={styles.wordmark}>b-view</div>
        <p className={styles.body}>
          b-view is an open-source journal viewer for Blipfoto backups, part of the{' '}
          <strong>b-oss</strong> project.
        </p>
        <p className={styles.copyright}>Version {__APP_VERSION__}</p>
        <p className={styles.copyright}>
          © {year} Ian Stevenson. Licensed under the GNU General Public License v3.
        </p>
        <a
          href="https://github.com/ianstevenson/b-oss"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          github.com/ianstevenson/b-oss
        </a>
      </div>
    </div>
  );
}
