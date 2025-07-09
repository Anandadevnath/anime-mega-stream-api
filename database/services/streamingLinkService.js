import StreamingLink from '../models/StreamingLink.js';

export const saveStreamingLink = async (linkData) => {
    try {
        const streamingLink = new StreamingLink(linkData);
        await streamingLink.save();
        console.log(`✅ Saved streaming link: ${streamingLink.title} - Episode ${streamingLink.episode_number}`);
        return streamingLink;
    } catch (error) {
        if (error.code === 11000) {
            // Duplicate key error - update existing
            const existingLink = await StreamingLink.findOneAndUpdate(
                { episode_url: linkData.episode_url },
                { ...linkData, updated_at: new Date() },
                { new: true, upsert: true }
            );
            console.log(`🔄 Updated existing streaming link: ${existingLink.title} - Episode ${existingLink.episode_number}`);
            return existingLink;
        } else {
            console.error(`❌ Error saving streaming link: ${error.message}`);
            throw error;
        }
    }
};

export const saveBulkStreamingLinks = async (linksData) => {
    try {
        const operations = linksData.map(link => ({
            updateOne: {
                filter: { episode_url: link.episode_url },
                update: { 
                    ...link, 
                    updated_at: new Date() 
                },
                upsert: true
            }
        }));

        const result = await StreamingLink.bulkWrite(operations);
        
        console.log(`✅ Bulk streaming links save completed:`);
        console.log(`   • Inserted: ${result.upsertedCount}`);
        console.log(`   • Updated: ${result.modifiedCount}`);
        console.log(`   • Total: ${linksData.length}`);
        
        return result;
    } catch (error) {
        console.error(`❌ Error bulk saving streaming links: ${error.message}`);
        throw error;
    }
};

export const getStreamingLinksByTitle = async (title) => {
    // Normalize: lowercase, replace spaces with dashes
    const slug = title.trim().toLowerCase().replace(/\s+/g, '-');
    try {
        return await StreamingLink.find({
            $expr: {
                $eq: [
                    {
                        $replaceAll: {
                            input: { $toLower: "$title" },
                            find: " ",
                            replacement: "-"
                        }
                    },
                    slug
                ]
            }
        }).sort({ episode_number: 1 });
    } catch (error) {
        console.error('Error fetching streaming links by title:', error.message);
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
        
        const total = await StreamingLink.countDocuments();
        
        return {
            streamingLinks,
            pagination: {
                current_page: page,
                total_pages: Math.ceil(total / limit),
                total_items: total,
                items_per_page: limit
            }
        };
    } catch (error) {
        console.error(`❌ Error getting all streaming links: ${error.message}`);
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
                    sources: { $addToSet: '$source' }
                }
            },
            {
                $project: {
                    total_links: 1,
                    unique_anime_count: { $size: '$unique_anime' },
                    sources: 1
                }
            }
        ]);
        return stats[0] || {
            total_links: 0,
            unique_anime_count: 0,
            sources: []
        };
    } catch (error) {
        console.error('Error fetching streaming links stats:', error.message);
        throw error;
    }
};