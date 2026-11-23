const fs = require('fs');
const mongoose = require('mongoose');

const bucket = () => {
  if (!mongoose.connection.db) throw new Error('MongoDB connection is not ready');
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'originalSources' });
};

async function storeOriginalSource(localPath, filename, contentType = 'application/pdf') {
  const id = new mongoose.Types.ObjectId();
  const upload = bucket().openUploadStream(filename || 'original.pdf', {
    id,
    contentType,
    metadata: { purpose: 'exam-original-source' },
  });
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(localPath);
    input.on('error', reject);
    upload.on('error', reject);
    upload.on('finish', resolve);
    input.pipe(upload);
  });
  return id;
}

async function sourceExists(id) {
  if (!id || !mongoose.connection.db) return false;
  try {
    return await bucket().find({ _id: new mongoose.Types.ObjectId(String(id)) }).hasNext();
  } catch {
    return false;
  }
}

async function deleteSource(id) {
  if (!id || !mongoose.connection.db) return;
  try {
    if (!(await sourceExists(id))) return;
    await bucket().delete(new mongoose.Types.ObjectId(String(id)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function downloadSource(id, res, filename = 'original.pdf', contentType = 'application/pdf') {
  const safeName = String(filename).replace(/[\\/:*?"<>|\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim() || 'original.pdf';
  res.setHeader('Content-Type', contentType || 'application/pdf');
  const fallbackName = safeName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'original.pdf';
  res.setHeader('Content-Disposition', `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  const stream = bucket().openDownloadStream(new mongoose.Types.ObjectId(String(id)));
  stream.on('error', (error) => {
    if (!res.headersSent) res.status(404).json({ message: 'মূল আপলোড PDF ফাইলটি সার্ভারে খুঁজে পাওয়া যায়নি' });
    else res.destroy(error);
  });
  stream.pipe(res);
}

module.exports = { storeOriginalSource, sourceExists, deleteSource, downloadSource };
