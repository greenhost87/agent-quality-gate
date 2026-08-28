declare const fabricsDao: {
  seedAttributes: (id: string) => Promise<void>;
};

export const surface = {
  seedAttributes(id: string): Promise<void> {
    return fabricsDao.seedAttributes(id);
  },
};
