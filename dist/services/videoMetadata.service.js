"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatVideoDuration = formatVideoDuration;
exports.fetchVideoMetadata = fetchVideoMetadata;
function extractYoutubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\n?#/]+)/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match?.[1])
            return match[1];
    }
    return null;
}
function formatVideoDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0)
        return '—';
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    if (minutes > 0) {
        return secs > 0 ? `${minutes}m ${secs}s` : `${minutes} mins`;
    }
    return `${secs}s`;
}
async function fetchVideoMetadata(url) {
    const trimmed = url.trim();
    if (!trimmed) {
        return {
            duration: '—',
            title: '',
            description: '',
            source: 'unknown',
            thumbnailUrl: '',
        };
    }
    const youtubeId = extractYoutubeId(trimmed);
    if (youtubeId) {
        try {
            const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
            let title = '';
            const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`);
            if (oembedRes.ok) {
                const oembed = (await oembedRes.json());
                title = String(oembed.title || '').trim();
            }
            const pageRes = await fetch(watchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
            const html = await pageRes.text();
            const lengthSecondsMatch = html.match(/"lengthSeconds":"(\d+)"/);
            const approxDurationMatch = html.match(/"approxDurationMs":"(\d+)"/);
            let seconds = 0;
            if (lengthSecondsMatch?.[1]) {
                seconds = Number(lengthSecondsMatch[1]);
            }
            else if (approxDurationMatch?.[1]) {
                seconds = Math.round(Number(approxDurationMatch[1]) / 1000);
            }
            return {
                duration: seconds > 0 ? formatVideoDuration(seconds) : '—',
                title,
                description: '',
                source: 'youtube',
                thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
            };
        }
        catch (error) {
            console.warn('YouTube metadata fetch failed:', error);
            return {
                duration: '—',
                title: '',
                description: '',
                source: 'youtube',
                thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
            };
        }
    }
    try {
        const oembedRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(trimmed)}`);
        if (oembedRes.ok) {
            const data = (await oembedRes.json());
            return {
                duration: '—',
                title: String(data.title || '').trim(),
                description: '',
                source: String(data.provider_name || 'link').toLowerCase(),
                thumbnailUrl: String(data.thumbnail_url || ''),
            };
        }
    }
    catch (error) {
        console.warn('oEmbed metadata fetch failed:', error);
    }
    return {
        duration: '—',
        title: '',
        description: '',
        source: 'file',
        thumbnailUrl: '',
    };
}
