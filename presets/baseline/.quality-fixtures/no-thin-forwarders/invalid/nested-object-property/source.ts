declare const fabricsDao: {
  seedAttributes: (id: string) => void;
};

export function buildSurface() {
  return {
    seedAttributes: (id: string) => fabricsDao.seedAttributes(id),
  };
}
