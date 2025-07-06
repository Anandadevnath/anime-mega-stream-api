import mongoose from 'mongoose';

const streamingLinkSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    episode_number: {
        type: String,
        required: true,
        trim: true
    },
    episode_url: {
        type: String,
        required: true,
        trim: true
    },
    streaming_link: {
        type: String,
        required: true,
        trim: true
    },
    image: {
        type: String,
        trim: true
    },
    range_id: {
        type: String,
        trim: true
    },
    strategy: {
        type: String,
        trim: true
    },
    source: {
        type: String,
        default: '123animes',
        trim: true
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    collection: 'animestreaminglinks'
});

// Create compound index for efficient queries
streamingLinkSchema.index({ title: 1, episode_number: 1 }, { unique: true });
streamingLinkSchema.index({ episode_url: 1 }, { unique: true });
streamingLinkSchema.index({ streaming_link: 1 });
streamingLinkSchema.index({ title: 1 });

export default mongoose.model('StreamingLink', streamingLinkSchema);