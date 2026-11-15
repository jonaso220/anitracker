import React, { useCallback, useState } from 'react';
import AnimeCard from './AnimeCard';
import { t } from '../i18n';

const LIST_EMOJIS = ['📋', '❤️', '🔥', '⭐', '🎯', '🎬', '🌸', '🗡️', '👾', '🏆'];

/**
 * Tarjetas de una lista. Componente aparte para tener un `onClick` estable por
 * lista: AnimeCard está en React.memo y llama `onClick(e, anime)`, así que un
 * callback creado en cada render la volvería a renderizar entera.
 */
const CustomListItems = React.memo(({ list, airingData, onDetail, onRemoveFromList }) => {
    const openCard = useCallback(
        (_e, anime) => onDetail({ ...anime, _customListId: list.id, _isCustomList: true, _isWatchLater: false, _isWatched: false, _isSeason: false }),
        [list.id, onDetail],
    );
    if (list.items.length === 0) {
        return (
            <div className="anime-grid">
                <div className="custom-list-empty">
                    <p>{t('lists.emptyList', 'Lista vacía. Agregá anime desde el buscador o el detalle.')}</p>
                </div>
            </div>
        );
    }
    return (
        <div className="anime-grid">
            {list.items.map(a => (
                <div key={a.id} className="custom-list-card-wrapper">
                    <AnimeCard anime={a} airingData={airingData} onClick={openCard} />
                    <button
                        type="button"
                        className="custom-list-remove-btn"
                        onClick={(e) => { e.stopPropagation(); onRemoveFromList(list.id, a.id); }}
                        aria-label={t('lists.removeItem', 'Quitar {title} de {list}', { title: a.title, list: list.name })}
                        title={t('lists.removeItemShort', 'Quitar de la lista')}
                    >
                        <span aria-hidden="true">✕</span>
                    </button>
                </div>
            ))}
        </div>
    );
});
CustomListItems.displayName = 'CustomListItems';

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
                <h2>{t('lists.title', '📋 Mis listas')}</h2>
                <span className="count">{customLists.length}</span>
                <button className="create-list-btn" onClick={() => setShowCreate(!showCreate)} aria-expanded={showCreate}>
                    {showCreate ? t('lists.cancelCreate', '✕ Cancelar') : t('lists.create', '+ Nueva lista')}
                </button>
            </div>

            {showCreate && (
                <div className="create-list-form fade-in">
                    <div className="create-list-emoji-picker" role="group" aria-label={t('lists.emojiPicker', 'Ícono de la lista')}>
                        {LIST_EMOJIS.map(e => (
                            <button key={e} type="button" className={`emoji-option ${newEmoji === e ? 'active' : ''}`} onClick={() => setNewEmoji(e)}
                                aria-pressed={newEmoji === e} aria-label={t('lists.emojiOption', 'Usar {emoji}', { emoji: e })}>{e}</button>
                        ))}
                    </div>
                    <div className="create-list-input-row">
                        <span className="create-list-emoji-preview" aria-hidden="true">{newEmoji}</span>
                        <input type="text" placeholder={t('lists.namePlaceholder', 'Nombre de la lista...')} aria-label={t('lists.nameLabel', 'Nombre de la lista')}
                            value={newName} onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()} autoFocus maxLength={30} />
                        <button className="create-list-confirm" onClick={handleCreate} disabled={!newName.trim()}>{t('lists.createConfirm', 'Crear')}</button>
                    </div>
                </div>
            )}

            {customLists.length === 0 ? (
                <div className="empty-state">
                    <span aria-hidden="true">📝</span>
                    <p>{t('lists.empty', 'No tenés listas personalizadas')}</p>
                    <p style={{ fontSize: '0.85rem', opacity: 0.5 }}>{t('lists.emptyHint', 'Creá una para organizar tu anime a tu manera')}</p>
                </div>
            ) : (
                <div className="custom-lists-container">
                    {customLists.map(list => (
                        <div key={list.id} className="custom-list-section fade-in">
                            <div
                                className="custom-list-header"
                                onClick={() => toggleCollapse(list.id)}
                                onKeyDown={(e) => {
                                    // Solo el encabezado en sí: las teclas del input de renombrar
                                    // (espacios, Enter) o de sus botones no pliegan la lista.
                                    if (e.target !== e.currentTarget) return;
                                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(list.id); }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-expanded={!collapsedLists.has(list.id)}
                            >
                                <div className="custom-list-title">
                                    <span className="custom-list-emoji" aria-hidden="true">{list.emoji}</span>
                                    {editingId === list.id ? (
                                        <input type="text" className="custom-list-rename-input" value={editName}
                                            aria-label={t('lists.renameLabel', 'Nuevo nombre para {name}', { name: list.name })}
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
                                        <button className="custom-list-action-btn" onClick={() => handleRename(list.id)} aria-label={t('lists.saveName', 'Guardar nombre')}>✓</button>
                                    ) : (
                                        <button className="custom-list-action-btn" onClick={() => { setEditingId(list.id); setEditName(list.name); }} aria-label={t('lists.rename', 'Renombrar {name}', { name: list.name })}>✏️</button>
                                    )}
                                    <button className="custom-list-action-btn delete" onClick={() => onDeleteList(list.id)} aria-label={t('lists.delete', 'Eliminar {name}', { name: list.name })}>🗑</button>
                                    <span className={`custom-list-chevron ${collapsedLists.has(list.id) ? 'collapsed' : ''}`} aria-hidden="true">▼</span>
                                </div>
                            </div>
                            {!collapsedLists.has(list.id) && (
                                <CustomListItems list={list} airingData={airingData} onDetail={onDetail} onRemoveFromList={onRemoveFromList} />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
};

export default React.memo(CustomListsTab);
