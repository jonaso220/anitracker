import React, { useState } from 'react';
import AnimeCard from './AnimeCard';

const LIST_EMOJIS = ['📋', '❤️', '🔥', '⭐', '🎯', '🎬', '🌸', '🗡️', '👾', '🏆'];

const CustomListsTab = ({ customLists, onCreateList, onDeleteList, onRenameList, onRemoveFromList, onDetail, airingData }) => {
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmoji, setNewEmoji] = useState('📋');
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [collapsedLists, setCollapsedLists] = useState(new Set());

    const toggleCollapse = (id) => {
        setCollapsedLists(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleCreate = () => {
        if (!newName.trim()) return;
        onCreateList(newName.trim(), newEmoji);
        setNewName('');
        setNewEmoji('📋');
        setShowCreate(false);
    };

    const handleRename = (id) => {
        if (!editName.trim()) return;
        onRenameList(id, editName.trim());
        setEditingId(null);
        setEditName('');
    };

    return (
        <>
            <div className="section-header">
                <h2>📋 Mis listas</h2>
                <span className="count">{customLists.length}</span>
                <button className="create-list-btn" onClick={() => setShowCreate(!showCreate)}>
                    {showCreate ? '✕ Cancelar' : '+ Nueva lista'}
                </button>
            </div>

            {showCreate && (
                <div className="create-list-form fade-in">
                    <div className="create-list-emoji-picker">
                        {LIST_EMOJIS.map(e => (
                            <button key={e} className={`emoji-option ${newEmoji === e ? 'active' : ''}`} onClick={() => setNewEmoji(e)}>{e}</button>
                        ))}
                    </div>
                    <div className="create-list-input-row">
                        <span className="create-list-emoji-preview">{newEmoji}</span>
                        <input type="text" placeholder="Nombre de la lista..." value={newName} onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()} autoFocus maxLength={30} />
                        <button className="create-list-confirm" onClick={handleCreate} disabled={!newName.trim()}>Crear</button>
                    </div>
                </div>
            )}

            {customLists.length === 0 ? (
                <div className="empty-state">
                    <span>📝</span>
                    <p>No tenés listas personalizadas</p>
                    <p style={{ fontSize: '0.85rem', opacity: 0.5 }}>Crea una para organizar tu anime a tu manera</p>
                </div>
            ) : (
                <div className="custom-lists-container">
                    {customLists.map(list => (
                        <div key={list.id} className="custom-list-section fade-in">
                            <div className="custom-list-header" onClick={() => toggleCollapse(list.id)}>
                                <div className="custom-list-title">
                                    <span className="custom-list-emoji">{list.emoji}</span>
                                    {editingId === list.id ? (
                                        <input type="text" className="custom-list-rename-input" value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleRename(list.id); if (e.key === 'Escape') setEditingId(null); }}
                                            onClick={e => e.stopPropagation()} autoFocus maxLength={30} />
                                    ) : (
                                        <span className="custom-list-name">{list.name}</span>
                                    )}
                                    <span className="custom-list-count">{list.items.length}</span>
                                </div>
                                <div className="custom-list-actions" onClick={e => e.stopPropagation()}>
                                    {editingId === list.id ? (
                                        <button className="custom-list-action-btn" onClick={() => handleRename(list.id)}>✓</button>
                                    ) : (
                                        <button className="custom-list-action-btn" onClick={() => { setEditingId(list.id); setEditName(list.name); }}>✏️</button>
                                    )}
                                    <button className="custom-list-action-btn delete" onClick={() => onDeleteList(list.id)}>🗑</button>
                                    <span className={`custom-list-chevron ${collapsedLists.has(list.id) ? 'collapsed' : ''}`}>▼</span>
                                </div>
                            </div>
                            {!collapsedLists.has(list.id) && (
                                <div className="anime-grid">
                                    {list.items.length > 0 ? list.items.map(a => (
                                        <div key={a.id} className="custom-list-card-wrapper">
                                            <AnimeCard anime={a} airingData={airingData}
                                                onClick={() => onDetail({ ...a, _customListId: list.id, _isCustomList: true, _isWatchLater: false, _isWatched: false, _isSeason: false })} />
                                            <button className="custom-list-remove-btn" onClick={(e) => { e.stopPropagation(); onRemoveFromList(list.id, a.id); }}>✕</button>
                                        </div>
                                    )) : (
                                        <div className="custom-list-empty">
                                            <p>Lista vacía. Agregá anime desde el buscador o el detalle.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
};

export default CustomListsTab;
