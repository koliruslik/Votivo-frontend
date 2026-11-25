import { createElement as h, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Cropper, { Area } from 'react-easy-crop';
import { cropImage } from './crop-image';

interface EditorProps {
  source: string;
  onSave: (photo: Blob) => Promise<void>;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}

function PhotoEditor(props: EditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  async function save() {
    if (!area || busy.current) return;
    busy.current = true;
    setSaving(true);
    props.onBusyChange(true);
    setError('');
    try {
      await props.onSave(await cropImage(props.source, area));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save your photo. Try again.');
    } finally {
      busy.current = false;
      setSaving(false);
      props.onBusyChange(false);
    }
  }

  return h(
    'div',
    { className: 'photo-editor', 'aria-busy': saving },
    h(
      'div',
      { className: 'photo-editor-heading' },
      h(
        'div',
        null,
        h('h2', { id: 'photo-editor-title' }, 'Make it your photo'),
        h('p', { id: 'photo-editor-help' }, 'Drag to position. Use the slider to zoom.'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'photo-close',
          'aria-label': 'Close photo editor',
          disabled: saving,
          onClick: props.onCancel,
        },
        '×',
      ),
    ),
    h(
      'div',
      { className: 'photo-crop-stage' },
      h(Cropper, {
        image: props.source,
        crop,
        zoom,
        aspect: 1,
        cropShape: 'round',
        rotation: 0,
        zoomSpeed: 1,
        style: {},
        classes: {},
        restrictPosition: true,
        keyboardStep: 1,
        showGrid: false,
        minZoom: 1,
        maxZoom: 3,
        onCropChange: setCrop,
        onZoomChange: setZoom,
        onCropAreaChange: (_percent: Area, pixels: Area) => setArea(pixels),
        onCropComplete: (_percent: Area, pixels: Area) => setArea(pixels),
        onTouchRequest: () => !busy.current,
        onWheelRequest: () => !busy.current,
        cropperProps: {
          'aria-label': 'Photo crop area. Use arrow keys to move the photo.',
          'aria-describedby': 'photo-editor-help',
          'aria-disabled': saving,
        },
        mediaProps: {
          alt: 'Photo being cropped',
          onError: () => {
            setArea(null);
            setError('This image could not be opened. Choose another photo.');
          },
        },
      }),
      saving ? h('div', { className: 'photo-crop-busy' }, 'Saving your photo…') : null,
    ),
    h(
      'div',
      { className: 'photo-zoom' },
      h('label', { htmlFor: 'photo-zoom' }, 'Zoom'),
      h('input', {
        id: 'photo-zoom',
        type: 'range',
        min: 1,
        max: 3,
        step: 0.01,
        value: zoom,
        disabled: saving,
        onChange: (event) => setZoom(Number(event.currentTarget.value)),
        'aria-valuetext': Math.round(zoom * 100) + '%',
      }),
      h('output', { htmlFor: 'photo-zoom' }, Math.round(zoom * 100) + '%'),
    ),
    h('p', { className: 'photo-editor-note' }, 'Your photo will appear in a circle.'),
    error ? h('p', { className: 'photo-editor-error', role: 'alert' }, error) : null,
    h(
      'div',
      { className: 'photo-editor-actions' },
      h(
        'button',
        { className: 'button', type: 'button', disabled: saving, onClick: props.onCancel },
        'Cancel',
      ),
      h(
        'button',
        { className: 'button primary', type: 'button', disabled: saving || !area, onClick: save },
        saving ? 'Saving…' : 'Save photo',
      ),
    ),
  );
}

export function mountPhotoEditor(host: HTMLElement, props: EditorProps) {
  const root = createRoot(host);
  root.render(h(PhotoEditor, props));
  return () => root.unmount();
}
