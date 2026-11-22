const test = require('node:test');
const assert = require('node:assert/strict');
const SiteSettings = require('./SiteSettings');

test('site settings provide safe homepage defaults', () => {
  const settings = new SiteSettings({ key: 'test' });
  assert.equal(settings.homepage.showHero, true);
  assert.equal(settings.homepage.showGallery, true);
  assert.equal(settings.homepage.showCta, true);
  assert.equal(settings.seo.title, '');
  assert.equal(settings.seo.description, '');
  assert.equal(settings.appearance.accent, 'coral');
  assert.equal(settings.appearance.mode, 'dark');
  assert.equal(settings.appearance.background, 'minimal');
  assert.equal(settings.appearance.density, 'comfortable');
  assert.equal(settings.appearance.radius, 'soft');
});

test('site media accepts durable GridFS identifiers without a local path', () => {
  const id = '507f1f77bcf86cd799439011';
  const settings = new SiteSettings({
    key: 'test',
    images: [{ slot: 'hero', gridFsId: id, contentType: 'image/png' }],
    media: [{ kind: 'video', gridFsId: id, contentType: 'video/mp4' }],
  });
  assert.equal(String(settings.images[0].gridFsId), id);
  assert.equal(String(settings.media[0].gridFsId), id);
  assert.equal(settings.validateSync(), undefined);
});
