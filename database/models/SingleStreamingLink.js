import mongoose from 'mongoose';

const singleStreamingLinkSchema = new mongoose.Schema({
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
        default: 'single-episode',
        trim: true
    },
    strategy: {
        type: String,
        default: 'single-episode',
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
    collection: 'animesinglelinks'
});

// Create compound index for efficient queries
singleStreamingLinkSchema.index({ title: 1, episode_number: 1 }, { unique: true });
singleStreamingLinkSchema.index({ episode_url: 1 }, { unique: true });
singleStreamingLinkSchema.index({ streaming_link: 1 });
singleStreamingLinkSchema.index({ title: 1 });

export default mongoose.model('SingleStreamingLink', singleStreamingLinkSchema);