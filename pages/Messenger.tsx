import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, Navigate } from 'react-router-dom';
import { Conversation, User, Message } from '../types';
import { getConversations, sendMessage, subscribeToMessages, resetConversationUnread } from '../services/firebase';
import { ChatWindow } from '../components/ChatWindow';
import { useAppContext } from '../contexts/AppContext';

const Messenger: React.FC = () => {
  const { currentUser } = useAppContext();
  const { conversationId: urlConversationId } = useParams<{ conversationId?: string }>();
  const location = useLocation();
  const contactSeller = location.state?.contactSeller as User | undefined;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const unsubRef = useRef<(() => void) | null>(null);

  if (!currentUser) return <Navigate to="/login" replace />;

  useEffect(() => {
    const loadConvos = async () => {
      setLoadingConvos(true);
      const data = await getConversations();
      setConversations(data);
      setLoadingConvos(false);

      const openId = urlConversationId;
      if (openId) {
        const found = data.find(c => c.id === openId);
        if (found) {
          setActiveConversation(found);
        } else if (contactSeller) {
          setActiveConversation({
            id: openId,
            participants: [currentUser, contactSeller] as [User, User],
            lastMessage: { id: '', text: '', senderId: '', receiverId: '', timestamp: Date.now(), read: false },
            unreadCount: 0,
          });
        }
      }
    };
    loadConvos();
  }, [urlConversationId]);

  useEffect(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (!activeConversation) { setMessages([]); return; }
    // Remettre à zéro le compteur non-lus quand on ouvre la conversation
    resetConversationUnread(activeConversation.id);
    const unsub = subscribeToMessages(activeConversation.id, setMessages);
    unsubRef.current = unsub;
    return () => { if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; } };
  }, [activeConversation?.id]);

  const getPartner = (convo: Conversation): User => {
    return convo.participants.find(p => p.id !== currentUser.id) || convo.participants[0];
  };

  const handleSend = async (text: string) => {
    if (!activeConversation) return;
    const partner = getPartner(activeConversation);
    await sendMessage(text, activeConversation.id, partner.id);
  };

  const handleBack = () => {
    setActiveConversation(null);
    getConversations().then(setConversations);
  };

  if (activeConversation) {
    const partner = getPartner(activeConversation);
    return (
      <div className="fixed inset-0 z-50 bg-gray-900">
        <ChatWindow partner={partner} messages={messages} onSend={handleSend} onBack={handleBack} currentUserId={currentUser.id} />
      </div>
    );
  }

  return (
    <div className="pb-24 pt-[60px] md:pt-24 px-4 max-w-2xl mx-auto min-h-screen">
      <h1 className="text-2xl font-bold text-white mb-6">Messages</h1>
      {loadingConvos ? (
        <div className="space-y-4">{[1, 2, 3].map(n => <div key={n} className="bg-gray-800/50 rounded-2xl h-20 animate-pulse" />)}</div>
      ) : (
        <div className="space-y-3">
          {conversations.map((convo) => {
            const partner = getPartner(convo);
            return (
              <div key={convo.id} onClick={() => setActiveConversation(convo)} className="flex items-center gap-4 p-4 bg-gray-800/50 border border-gray-700/50 rounded-2xl cursor-pointer hover:bg-gray-800 transition-colors">
                <div className="relative">
                  {partner.avatar ? <img src={partner.avatar} alt={partner.name} className="w-14 h-14 rounded-full object-cover" /> : <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-lg font-bold">{partner.name?.charAt(0)?.toUpperCase() || '?'}</div>}
                  {convo.unreadCount > 0 && <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-gray-900">{convo.unreadCount}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="text-white font-semibold truncate">{partner.name || 'Utilisateur'}</h3>
                    {convo.lastMessage?.timestamp && <span className="text-xs text-gray-500">{new Date(convo.lastMessage.timestamp).toLocaleDateString()}</span>}
                  </div>
                  {convo.lastMessage?.text && <p className={`text-sm truncate ${convo.unreadCount > 0 ? 'text-gray-200 font-medium' : 'text-gray-400'}`}>{convo.lastMessage.senderId === currentUser.id ? 'Vous: ' : ''}{convo.lastMessage.text}</p>}
                </div>
              </div>
            );
          })}
          {conversations.length === 0 && (
            <div className="text-center text-gray-500 mt-20">
              <div className="text-4xl mb-3">💬</div>
              <p className="font-medium text-white mb-1">Aucune conversation</p>
              <p className="text-sm">Contactez un vendeur depuis sa fiche produit.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Messenger;
