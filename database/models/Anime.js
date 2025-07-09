import mongoose from 'mongoose';

const animeSchema = new mongoose.Schema({
    index: {
        type: Number,
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    anime_redirect_link: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    episodes: {
        type: String,
        default: 'N/A'
    },
    image: {
        type: String,
        default: null
    },
    audio_type: {
        type: String,
        enum: ['SUB', 'DUB', 'BOTH'],
        default: 'SUB'
    },
    type: {
        type: String,
        default: 'TV Series'
    },
    genres: {
        type: String,
        default: null
    },
    country: {
        type: String,
        default: 'Japan'
    },
    status: {
        type: String,
        default: 'Ongoing'
    },
    released: {
        type: String,
        default: null
    },
    description: {
        type: String,
        default: null
    },
    source: {
        type: String,
        enum: ['HiAnime', '123animes', 'Mixed'],
        default: 'Mixed'
    },
    category: {
        type: String,
        enum: ['trending', 'weekly', 'monthly', 'general'],
        default: 'general'
    },
}, {
    timestamps: true
});

// Create indexes for better performance
animeSchema.index({ title: 1 });
animeSchema.index({ category: 1 });
animeSchema.index({ source: 1 });
animeSchema.index({ scraped_at: -1 });

// Update the updated_at field before saving
animeSchema.pre('save', function(next) {
    this.updated_at = new Date();
    next();
});

const Anime = mongoose.model('Anime', animeSchema, 'animelits');

export default Anime;
