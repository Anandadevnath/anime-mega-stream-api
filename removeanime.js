import express from 'express';
import mongoose from 'mongoose';
import StreamingLink from './database/models/StreamingLink.js';

const router = express.Router();

function normalizeTitle(title) {
  return title.trim().toLowerCase().replace(/\s+/g, '-');
}

router.delete('/remove-anime', async (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Anime title (id) is required.' });
  }
  const normalizedTitle = normalizeTitle(id);
  try {
    const result = await StreamingLink.deleteMany({
      $expr: {
        $eq: [
          {
            $replaceAll: {
              input: { $toLower: "$title" },
              find: " ",
              replacement: "-"
            }
          },
          normalizedTitle
        ]
      }
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'No streaming links found for the specified anime.' });
    }
    res.json({ message: `Deleted ${result.deletedCount} streaming links for anime '${id}'.` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete streaming links.', details: error.message });
  }
});

export default router;
