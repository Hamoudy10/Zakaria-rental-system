import { io } from 'socket.io-client';

class ChatService {
    constructor() {
        this.socket = null;
        this.listeners = new Map();
    }

    init(token) {
        if (!token) {
            console.error('No token provided for chat service');
            return;
        }

        try {
            this.socket = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001', {
                auth: { token },
                timeout: 10000
            });

            this.socket.on('connect', () => {
                console.log('Connected to chat server');
            });
       
            this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from chat server');
            });

            this.socket.on('error', (error) => {
                console.error('Chat socket error:', error);
            });
        } catch (error) {
            console.error('Failed to initialize chat service:', error);
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        this.socket?.on(event, callback);
    }

    off(event, callback) {
        const listeners = this.listeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
        this.socket?.off(event, callback);
    }

    emit(event, data) {
        this.socket?.emit(event, data);
    }

    disconnect() {
        this.socket?.disconnect();
        this.listeners.clear();
    }

    // API methods
    async getConversations() {
        try {
            const response = await fetch('/api/chat/conversations', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to get conversations:', error);
            return { success: false, conversations: [] };
        }
    }

    async getMessages(conversationId, page = 1) {
        try {
            const response = await fetch(`/api/chat/conversations/${conversationId}/messages?page=${page}&limit=50`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to get messages:', error);
            return { success: false, messages: [] };
        }
    }

    async sendMessage(conversationId, messageText, parentMessageId = null) {
        try {
            const response = await fetch('/api/chat/messages/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    conversationId,
                    messageText,
                    parentMessageId
                })
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to send message:', error);
            return { success: false, message: null };
        }
    }

    async createConversation(participantIds, title = null, conversationType = 'direct') {
        try {
            const response = await fetch('/api/chat/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    participantIds,
                    title,
                    conversationType
                })
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to create conversation:', error);
            return { success: false, conversation: null };
        }
    }

    async searchMessages(query, conversationId = null) {
        try {
            const params = new URLSearchParams({ query });
            if (conversationId) params.append('conversationId', conversationId);
            
            const response = await fetch(`/api/chat/search?${params}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to search messages:', error);
            return { success: false, results: [] };
        }
    }

    async markAsRead(messageIds) {
        try {
            const response = await fetch('/api/chat/messages/mark-read', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ messageIds })
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to mark messages as read:', error);
            return { success: false };
        }
    }

    async getAvailableUsers() {
        try {
            const response = await fetch('/api/chat/available-users', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to get available users:', error);
            return { success: false, users: [] };
        }
    }

    joinConversation(conversationId) {
        this.emit('join_conversation', { conversationId });
    }

    leaveConversation(conversationId) {
        this.emit('leave_conversation', { conversationId });
    }
}

export default new ChatService();