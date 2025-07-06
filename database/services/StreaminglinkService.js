import StreamingLink from '../models/StreamingLink.js';

export const saveStreamingLink = async (streamingLinkData) => {
    try {
        const existingLink = await StreamingLink.findOne({
            title: streamingLinkData.title,
            episode_number: streamingLinkData.episode_number
        });

        if (existingLink) {
            // Update existing streaming link
            const updatedLink = await StreamingLink.findByIdAndUpdate(
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
            const newLink = new StreamingLink({
                ...streamingLinkData,
                created_at: new Date(),
                updated_at: new Date()
            });
            await newLink.save();
            return newLink;
        }
    } catch (error) {
        console.error('Error saving streaming link:', error.message);
        throw error;
    }
};

export const saveBulkStreamingLinks = async (streamingLinksData) => {
    try {
        const savePromises = streamingLinksData.map(linkData => saveStreamingLink(linkData));
        const results = await Promise.allSettled(savePromises);
        
        const successful = results.filter(result => result.status === 'fulfilled').length;
        const failed = results.filter(result => result.status === 'rejected').length;
        
        console.log(`💾 Bulk save completed: ${successful} successful, ${failed} failed`);
        return { successful, failed };
    } catch (error) {
        console.error('Error in bulk save streaming links:', error.message);
        throw error;
    }
};

export const getStreamingLinksByAnime = async (animeTitle, limit = 50) => {
    try {
        const streamingLinks = await StreamingLink.find({ title: animeTitle })
            .sort({ episode_number: 1 })
            .limit(limit);
        return streamingLinks;
    } catch (error) {
        console.error('Error fetching streaming links:', error.message);
        throw error;
    }
};

export const getAllStreamingLinks = async (page = 1, limit = 50) => {
    try {
        const skip = (page - 1) * limit;
        const streamingLinks = await StreamingLink.find()
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit);
        
        const totalCount = await StreamingLink.countDocuments();
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
        console.error('Error fetching all streaming links:', error.message);
        throw error;
    }
};

export const getStreamingLinksStats = async () => {
    try {
        const stats = await StreamingLink.aggregate([
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
        console.error('Error fetching streaming links stats:', error.message);
        throw error;
    }
};