import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type {
  DashboardWidget,
  DashboardWidgetConfig,
} from "../../../services/dashboardTypes";
import WidgetShell from "./WidgetShell";
import { WidgetBody, WidgetText } from "./widgetPrimitives";
import { IconImageGallery } from "./widgetIcons";

type GalleryItem =
  | { kind: "stored"; id: string; src: string }
  | { kind: "legacy"; legacyIndex: number; src: string };

const EMPTY_GALLERY_IMAGES: string[] = [];

const isInlineImageDataUrl = (value: string): boolean =>
  /^data:image\//i.test(value);

const ImageGalleryWidget: React.FC<{
  widget: DashboardWidget;
  onUpdateWidgetConfig?: (
    widgetId: string,
    patch: Partial<DashboardWidgetConfig>,
  ) => void;
}> = ({ widget, onUpdateWidgetConfig }) => {
  // TODO: [pinchZoomEnabled] When effectiveToggle('pinchZoomEnabled', boardInteractivity, widget.config)
  // is true, implement pinch-to-zoom inside DashboardFocusedWidgetOverlay and swipe navigation
  // in the compact tile. Gate behind: effectiveToggle('pinchZoomEnabled', boardInteractivity, widget.config)

  const galleryImageIds = widget.config.galleryImageIds || EMPTY_GALLERY_IMAGES;
  const legacyImages = widget.config.galleryImages || EMPTY_GALLERY_IMAGES;
  const galleryImageIdsKey = galleryImageIds.join("|");
  const legacyImagesKey = legacyImages.join("|");
  const [activeIndex, setActiveIndex] = useState(0);
  const [storedImageUrls, setStoredImageUrls] = useState<Record<string, string>>(
    {},
  );
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const migrationKeyRef = useRef("");

  const updateWidgetConfig = useCallback(
    (patch: Partial<DashboardWidgetConfig>) => {
      onUpdateWidgetConfig?.(widget.id, patch);
    },
    [onUpdateWidgetConfig, widget.id],
  );

  useEffect(() => {
    let cancelled = false;
    let urlsToRevoke: string[] = [];

    if (galleryImageIds.length === 0) {
      setStoredImageUrls({});
      return () => {};
    }

    void import("../../../services/dashboardImageStore")
      .then(({ getDashboardGalleryImageBlobUrls }) =>
        getDashboardGalleryImageBlobUrls(galleryImageIds),
      )
      .then((urls) => {
        urlsToRevoke = Object.values(urls);
        if (cancelled) {
          urlsToRevoke.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        setStoredImageUrls(urls);
      })
      .catch((error) => {
        console.warn("[ImageGalleryWidget] Failed to load gallery images:", error);
        if (!cancelled) {
          setStoredImageUrls({});
          setStatusMessage("Some photos could not be loaded on this device.");
        }
      });

    return () => {
      cancelled = true;
      urlsToRevoke.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [galleryImageIdsKey]);

  useEffect(() => {
    const inlineImages = legacyImages.filter(isInlineImageDataUrl);
    if (inlineImages.length === 0) return;

    const migrationKey = `${inlineImages.length}:${inlineImages
      .map((image) => image.length)
      .join(",")}:${galleryImageIds.join("|")}`;
    if (migrationKeyRef.current === migrationKey) return;
    migrationKeyRef.current = migrationKey;

    let cancelled = false;
    void import("../../../services/dashboardImageStore")
      .then(({ addDashboardGalleryDataUrls }) =>
        addDashboardGalleryDataUrls(inlineImages),
      )
      .then((migratedIds) => {
        if (cancelled || migratedIds.length === 0) return;
        const remainingLegacyImages = legacyImages.filter(
          (image) => !isInlineImageDataUrl(image),
        );
        try {
          updateWidgetConfig({
            galleryImageIds: [...galleryImageIds, ...migratedIds],
            galleryImages: remainingLegacyImages,
          });
        } catch (error) {
          console.warn("[ImageGalleryWidget] Failed to migrate inline images:", error);
          setStatusMessage("Photos were loaded, but dashboard storage is full.");
        }
      })
      .catch((error) => {
        console.warn("[ImageGalleryWidget] Failed to migrate inline images:", error);
        if (!cancelled) {
          setStatusMessage("Some older photos could not be moved out of dashboard storage.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [galleryImageIdsKey, legacyImagesKey, updateWidgetConfig]);

  const imageItems = useMemo<GalleryItem[]>(() => {
    const storedItems = galleryImageIds
      .map((id) => {
        const src = storedImageUrls[id];
        return src ? ({ kind: "stored", id, src } as GalleryItem) : null;
      })
      .filter((item): item is GalleryItem => Boolean(item));
    const legacyItems = legacyImages.map((src, legacyIndex) => ({
      kind: "legacy" as const,
      legacyIndex,
      src,
    }));
    return [...storedItems, ...legacyItems];
  }, [galleryImageIds, legacyImages, storedImageUrls]);

  useEffect(() => {
    if (activeIndex >= imageItems.length) {
      setActiveIndex(Math.max(0, imageItems.length - 1));
    }
  }, [activeIndex, imageItems.length]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setStatusMessage("");
    try {
      const { addDashboardGalleryImages } = await import(
        "../../../services/dashboardImageStore"
      );
      const newIds = await addDashboardGalleryImages(Array.from(files));
      if (newIds.length === 0) return;

      updateWidgetConfig({
        galleryImageIds: [...galleryImageIds, ...newIds],
        galleryImages: legacyImages,
      });

      if (imageItems.length === 0) {
        setActiveIndex(0);
      }
    } catch (error) {
      console.warn("[ImageGalleryWidget] Failed to save uploaded images:", error);
      setStatusMessage("Photos could not be saved. Try fewer or smaller images.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    const item = imageItems[index];
    if (!item) return;

    if (item.kind === "stored") {
      const nextIds = galleryImageIds.filter((id) => id !== item.id);
      updateWidgetConfig({ galleryImageIds: nextIds });
      void import("../../../services/dashboardImageStore")
        .then(({ removeDashboardGalleryImage }) =>
          removeDashboardGalleryImage(item.id),
        )
        .catch((error) =>
          console.warn("[ImageGalleryWidget] Failed to remove gallery image:", error),
        );
    } else {
      const nextLegacyImages = legacyImages.filter(
        (_, legacyIndex) => legacyIndex !== item.legacyIndex,
      );
      updateWidgetConfig({ galleryImages: nextLegacyImages });
    }

    if (activeIndex >= imageItems.length - 1) {
      setActiveIndex(Math.max(0, imageItems.length - 2));
    }
  };

  const nextImage = () => {
    setActiveIndex((current) => (current + 1) % imageItems.length);
  };

  const prevImage = () => {
    setActiveIndex((current) => (current - 1 + imageItems.length) % imageItems.length);
  };

  const hasImages = imageItems.length > 0 || galleryImageIds.length > 0;
  const currentImage = imageItems[activeIndex]?.src || null;

  return (
    <WidgetShell
      widget={widget}
      title={hasImages ? "" : "Image Gallery"}
      icon={hasImages ? null : <IconImageGallery />}
      accent="indigo"
      padded={!hasImages}
      ghost={hasImages}
      rightSlot={
        <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
            title="Upload Images"
          >
            <Plus size={16} />
          </button>
          {hasImages && (
            <button
              onClick={() => removeImage(activeIndex)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-500 transition hover:bg-rose-500/20"
              title="Remove Image"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      }
    >
      <WidgetBody gap="none" className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {hasImages && currentImage ? (
          <div className="group/gallery relative h-full w-full overflow-hidden rounded-[1.2rem] bg-black/5">
            <img
              src={currentImage}
              alt={`Gallery ${activeIndex + 1}`}
              className="h-full w-full object-cover transition-transform duration-700 group-hover/gallery:scale-[1.02]"
            />

            {/* Navigation Overlays */}
            {imageItems.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    prevImage();
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur-md transition-all duration-300 hover:bg-black/50 group-hover/gallery:opacity-100"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    nextImage();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur-md transition-all duration-300 hover:bg-black/50 group-hover/gallery:opacity-100"
                >
                  <ChevronRight size={24} />
                </button>

                {/* Pagination Dots */}
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 opacity-0 transition-opacity duration-300 group-hover/gallery:opacity-100">
                  {imageItems.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                        i === activeIndex
                          ? "w-4 bg-white shadow-lg"
                          : "bg-white/40"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : hasImages ? (
          <div className="flex flex-1 items-center justify-center rounded-[1.2rem] bg-[var(--ether-control-bg)] text-center text-xs font-semibold text-[var(--ether-on-surface-variant)]">
            Loading photos...
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 rounded-[1.2rem] border-2 border-dashed border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] transition hover:bg-[var(--ether-control-hover)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500">
              <Upload size={24} />
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-[var(--ether-on-surface)]">
                Click to upload photos
              </div>
              <div className="mt-1">
                <WidgetText variant="label" tone="muted" align="center">
                  Multi-select supported
                </WidgetText>
              </div>
              {statusMessage && (
                <div className="mt-2 px-4 text-[10px] font-semibold text-rose-500">
                  {statusMessage}
                </div>
              )}
            </div>
          </div>
        )}
        {hasImages && statusMessage && (
          <div className="absolute bottom-3 left-3 right-3 rounded-full bg-black/60 px-3 py-1.5 text-center text-[10px] font-semibold text-white backdrop-blur">
            {statusMessage}
          </div>
        )}
      </WidgetBody>
    </WidgetShell>
  );
};

export default React.memo(ImageGalleryWidget);
