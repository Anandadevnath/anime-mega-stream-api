import SingleStreamingLink from '../models/SingleStreamingLink.js';

export const saveSingleStreamingLink = async (streamingLinkData) => {
    try {
        const existingLink = await SingleStreamingLink.findOne({
            title: streamingLinkData.title,
            episode_number: streamingLinkData.episode_number
        });

        if (existingLink) {
            // Update existing streaming link
            const updatedLink = await SingleStreamingLink.findByIdAndUpdate(
                existingLink._id,
                {
                    ...streamingLinkData,
                    updated_at: new Date()
                },
                { new: true, runValidators: true }
            );
            return updatedLink;
        } else {
            // Create new streaming link
            const newLink = new SingleStreamingLink({
                ...streamingLinkData,
                created_at: new Date(),
                updated_at: new Date()
            });
            await newLink.save();
            return newLink;
        }
    } catch (error) {
        console.error('Error saving single streaming link:', error.message);
        throw error;
    }
};

export const saveBulkSingleStreamingLinks = async (streamingLinksData) => {
    try {
        const savePromises = streamingLinksData.map(linkData => saveSingleStreamingLink(linkData));
        const results = await Promise.allSettled(savePromises);
        
        const successful = results.filter(result => result.status === 'fulfilled').length;
        const failed = results.filter(result => result.status === 'rejected').length;
        
        console.log(`💾 Bulk save completed: ${successful} successful, ${failed} failed`);
        return { successful, failed };
    } catch (error) {
        console.error('Error in bulk save single streaming links:', error.message);
        throw error;
    }
};

export const getSingleStreamingLinksByAnime = async (animeTitle, limit = 50) => {
    try {
        const streamingLinks = await SingleStreamingLink.find({ title: animeTitle })
            .sort({ episode_number: 1 })
            .limit(limit);
        return streamingLinks;
    } catch (error) {
        console.error('Error fetching single streaming links:', error.message);
        throw error;
    }
};

export const getAllSingleStreamingLinks = async (page = 1, limit = 50) => {
    try {
        const skip = (page - 1) * limit;
        const streamingLinks = await SingleStreamingLink.find()
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit);
        
        const totalCount = await SingleStreamingLink.countDocuments();
        const totalPages = Math.ceil(totalCount / limit);
        
        return {
            streamingLinks,
            pagination: {
                current_page: page,
                total_pages: totalPages,
                total_items: totalCount,
                items_per_page: limit
            }
        };
    } catch (error) {
        console.error('Error fetching all single streaming links:', error.message);
        throw error;
    }
};

export const getSingleStreamingLinksStats = async () => {
    try {
        const stats = await SingleStreamingLink.aggregate([
            {
                $group: {
                    _id: null,
                    total_links: { $sum: 1 },
                    unique_anime: { $addToSet: '$title' },
                    strategies: { $addToSet: '$strategy' },
                    sources: { $addToSet: '$source' }
                }
            },
            {
                $project: {
                    total_links: 1,
                    unique_anime_count: { $size: '$unique_anime' },
                    strategies: 1,
                    sources: 1
                }
            }
        ]);
        
        return stats[0] || {
            total_links: 0,
            unique_anime_count: 0,
            strategies: [],
            sources: []
        };
    } catch (error) {
        console.error('Error fetching single streaming links stats:', error.message);
        throw error;
    }
};