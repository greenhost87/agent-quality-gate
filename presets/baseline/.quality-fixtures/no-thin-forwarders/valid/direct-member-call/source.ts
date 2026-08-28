declare const fabricsDao: {
  seedAttributes: (id: string) => Promise<void>;
};

export async function seedAttributes(id: string): Promise<void> {
  await fabricsDao.seedAttributes(id);
}
