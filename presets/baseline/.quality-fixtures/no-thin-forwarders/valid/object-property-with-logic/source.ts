declare const fabricsDao: {
  seedAttributes: (id: string, label: string) => void;
};

export const surface = {
  seedAttributes: (id: string) => fabricsDao.seedAttributes(id, 'surface'),
};
