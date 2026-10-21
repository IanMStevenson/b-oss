// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// BBCodeEditor in the bordered box the comment composer draws around it, for hosts that want the
// rich-text description box as a form field (b-mobile's compose / edit-entry pages).

import { BBCodeEditor, type BBCodeEditorProps } from './BBCodeEditor.js';
import styles from './CommentComposer.module.css';

export type BBCodeFieldProps = Pick<
  BBCodeEditorProps,
  'value' | 'onChange' | 'ariaLabel' | 'placeholder'
>;

export function BBCodeField({ value, onChange, ariaLabel, placeholder }: BBCodeFieldProps) {
  return (
    <div className={styles.box}>
      <BBCodeEditor
        value={value}
        onChange={onChange}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        readOnly={false}
        autoFocus={false}
      />
    </div>
  );
}
