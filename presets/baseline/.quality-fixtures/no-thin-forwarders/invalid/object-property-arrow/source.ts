declare const fabricsDao: {
  seedAttributes: (...args: unknown[]) => unknown;
};

export const surface = {
  seedAttributes: (...args: unknown[]) => fabricsDao.seedAttributes(...args),
};
