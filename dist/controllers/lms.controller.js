"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveVideoMetadata = exports.generateLmsContent = void 0;
const gemini_service_1 = require("../services/gemini.service");
const videoMetadata_service_1 = require("../services/videoMetadata.service");
const generateLmsContent = async (req, res) => {
    try {
        const { type, topic, courseName, difficulty, count, existingTopics, excludeQuestions } = req.body || {};
        if (type === 'quizzes') {
            const result = await (0, gemini_service_1.generateQuizContent)({
                topic: String(topic || ''),
                courseName: String(courseName || 'Course'),
                difficulty: String(difficulty || 'Medium'),
                count: Number(count) || 10,
                existingTopics: Array.isArray(existingTopics)
                    ? existingTopics.map((item) => String(item || ''))
                    : [],
                excludeQuestions: Array.isArray(excludeQuestions)
                    ? excludeQuestions.map((item) => String(item || ''))
                    : [],
                tenantId: req.user?.tenantId,
            });
            return res.status(200).json(result);
        }
        if (type === 'assignments') {
            const result = await (0, gemini_service_1.generateAssignmentContent)({
                topic: String(topic || ''),
                courseName: String(courseName || 'Course'),
                difficulty: String(difficulty || 'Medium'),
                tenantId: req.user?.tenantId,
            });
            return res.status(200).json(result);
        }
        return res.status(400).json({ message: `Unsupported generation type: ${type}` });
    }
    catch (error) {
        console.error('LMS AI generation failed:', error);
        res.status(500).json({
            message: error?.message || 'Failed to generate LMS content',
        });
    }
};
exports.generateLmsContent = generateLmsContent;
const resolveVideoMetadata = async (req, res) => {
    try {
        const url = String(req.body?.url || '').trim();
        if (!url) {
            return res.status(400).json({ message: 'Video URL is required' });
        }
        const metadata = await (0, videoMetadata_service_1.fetchVideoMetadata)(url);
        return res.status(200).json(metadata);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to resolve video metadata';
        console.error('Video metadata resolution failed:', error);
        return res.status(500).json({ message });
    }
};
exports.resolveVideoMetadata = resolveVideoMetadata;
