import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findClipboardImageFile,
  MAX_IMAGE_BYTES,
  normalizeTeachingImageFile
} from '../src/lib/image-upload.js';

test('image upload helper accepts JPEG/PNG files and creates a pasted filename when needed', () => {
  const png = new File(['png-bytes'], '', { type: 'image/png' });
  const result = normalizeTeachingImageFile(png, 123);

  assert.ok('file' in result);
  assert.equal(result.file.name, 'pasted-image-123.png');
  assert.equal(result.file.type, 'image/png');

  const jpeg = new File(['jpeg-bytes'], 'teaching.jpg', { type: 'image/jpeg' });
  const jpegResult = normalizeTeachingImageFile(jpeg);
  assert.ok('file' in jpegResult);
  assert.equal(jpegResult.file, jpeg);
});

test('image upload helper rejects unsupported and oversized files', () => {
  const gifResult = normalizeTeachingImageFile(new File(['gif'], 'image.gif', { type: 'image/gif' }));
  assert.deepEqual(gifResult, { error: 'Choose a JPEG or PNG image.' });

  const oversized = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'large.png', { type: 'image/png' });
  assert.deepEqual(normalizeTeachingImageFile(oversized), { error: 'That image is larger than the 5 MiB limit.' });
});

test('clipboard helper finds image files in clipboard items or files', () => {
  const itemFile = new File(['png'], 'clipboard.png', { type: 'image/png' });
  const itemClipboard = {
    items: [{ kind: 'file', getAsFile: () => itemFile }],
    files: []
  };
  assert.equal(findClipboardImageFile(/** @type {any} */ (itemClipboard)), itemFile);

  const fileClipboard = { items: [], files: [itemFile] };
  assert.equal(findClipboardImageFile(/** @type {any} */ (fileClipboard)), itemFile);
});
