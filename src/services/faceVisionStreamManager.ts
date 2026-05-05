const FACE_VISION_STREAM_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 192 },
    height: { ideal: 144 },
    frameRate: { ideal: 15, max: 20 },
  },
  audio: false,
};

type GetUserMediaFn = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

type FaceVisionLease = {
  stream: MediaStream;
  release: () => void;
};

let sharedStream: MediaStream | null = null;
let sharedStreamPromise: Promise<MediaStream> | null = null;
let activeLeaseCount = 0;
// Callers awaiting sharedStreamPromise that haven't incremented
// activeLeaseCount yet. Without this, a caller can release-to-zero while
// another awaiter is mid-promise and hand them a torn-down stream.
let pendingAcquireCount = 0;

const getDefaultGetUserMedia = (): GetUserMediaFn => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support camera capture for face tracking.');
  }

  return navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
};

const stopStreamTracks = (stream: MediaStream | null) => {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => {
    track.stop();
  });
};

const clearSharedStream = () => {
  stopStreamTracks(sharedStream);
  sharedStream = null;
  sharedStreamPromise = null;
};

const ensureSharedFaceVisionStream = async (
  getUserMedia: GetUserMediaFn,
): Promise<MediaStream> => {
  if (sharedStream) {
    return sharedStream;
  }

  if (!sharedStreamPromise) {
    sharedStreamPromise = getUserMedia(FACE_VISION_STREAM_CONSTRAINTS)
      .then((stream) => {
        sharedStream = stream;
        return stream;
      })
      .catch((error) => {
        sharedStreamPromise = null;
        throw error;
      });
  }

  return await sharedStreamPromise;
};

export const acquireFaceVisionStream = async (
  getUserMedia = getDefaultGetUserMedia(),
): Promise<FaceVisionLease> => {
  pendingAcquireCount += 1;
  let stream: MediaStream;
  try {
    stream = await ensureSharedFaceVisionStream(getUserMedia);
  } finally {
    pendingAcquireCount = Math.max(0, pendingAcquireCount - 1);
  }
  activeLeaseCount += 1;

  let released = false;

  return {
    stream,
    release: () => {
      if (released) {
        return;
      }

      released = true;
      activeLeaseCount = Math.max(0, activeLeaseCount - 1);

      // Only tear down when nothing is using the stream AND nothing is
      // about to start using it. Prevents a rapid open/close in the
      // settings modal from handing the next awaiter a dead stream.
      if (activeLeaseCount === 0 && pendingAcquireCount === 0) {
        clearSharedStream();
      }
    },
  };
};

export const resetFaceVisionStreamManagerForTests = (): void => {
  activeLeaseCount = 0;
  pendingAcquireCount = 0;
  clearSharedStream();
};
