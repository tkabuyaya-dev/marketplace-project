import React, { useRef, useState, useCallback } from 'react';

interface Props {
  previews: string[];
  maxImages?: number;
  onAdd: (files: File[], previews: string[]) => void;
  onRemove: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  compressing?: boolean;
}

/**
 * Smart Image Upload with drag & drop, reorder, and clean preview.
 * No external dependencies.
 */
export const SmartImageUpload: React.FC<Props> = ({
  previews,
  maxImages = 5,
  onAdd,
  onRemove,
  onReorder,
  compressing = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const remaining = maxImages - previews.length;

  const processFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).slice(0, remaining);
    if (fileArray.length === 0) return;

    // Generate previews
    const newPreviews: string[] = [];
    let loaded = 0;

    fileArray.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        newPreviews.push(ev.target?.result as string);
        loaded++;
        if (loaded === fileArray.length) {
          onAdd(fileArray, newPreviews);
        }
      };
      reader.readAsDataURL(file);
    });
  }, [remaining, onAdd]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Reorder drag handlers
  const handleThumbDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleThumbDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleThumbDrop = (index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      onReorder(dragIndex, index);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold text-gray-400 mb-1">
        Photos du produit * ({previews.length}/{maxImages})
      </label>

      {/* Preview grid with drag-to-reorder */}
      {previews.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {previews.map((preview, i) => (
            <div
              key={i}
              draggable
              onDragStart={() => handleThumbDragStart(i)}
              onDragOver={(e) => handleThumbDragOver(e, i)}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
              onDrop={() => handleThumbDrop(i)}
              className={`relative aspect-square rounded-xl overflow-hidden border-2 group cursor-grab active:cursor-grabbing transition-all ${
                dragOverIndex === i
                  ? 'border-gold-400 scale-105'
                  : dragIndex === i
                  ? 'border-gold-400/50 opacity-50'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <img
                src={preview}
                alt={`Photo ${i + 1}`}
                className="w-full h-full object-cover"
                draggable={false}
              />

              {/* Remove button */}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-600/90 text-white text-xs rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm"
              >
                &times;
              </button>

              {/* Badge */}
              {i === 0 && (
                <span className="absolute bottom-1.5 left-1.5 text-[9px] bg-gold-400 text-gray-900 px-2 py-0.5 rounded-full font-bold">
                  Principal
                </span>
              )}

              {/* Drag hint */}
              <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/40 backdrop-blur-sm rounded text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                ⠿
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Compression indicator */}
      {compressing && (
        <div className="flex items-center gap-2 text-xs text-gold-400 bg-gold-400/10 px-3 py-2 rounded-lg">
          <div className="w-3.5 h-3.5 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
          Optimisation des images en cours...
        </div>
      )}

      {/* Drop zone */}
      {remaining > 0 && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
              dragOver
                ? 'border-gold-400 bg-gold-400/5'
                : 'border-gray-700 hover:border-gray-600 bg-gray-900/30'
            }`}
          >
            <div className="text-3xl mb-2">{dragOver ? '📥' : '📸'}</div>
            <p className="text-gray-300 font-medium text-sm">
              {dragOver ? 'Deposez ici' : 'Cliquez ou glissez pour ajouter'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              JPG, PNG ou WebP — max 10MB — encore {remaining} photo{remaining > 1 ? 's' : ''}
            </p>
          </div>
        </>
      )}

      {/* Reorder hint */}
      {previews.length > 1 && (
        <p className="text-[10px] text-gray-600 text-center">
          Glissez les photos pour les reordonner. La premiere sera l'image principale.
        </p>
      )}
    </div>
  );
};
