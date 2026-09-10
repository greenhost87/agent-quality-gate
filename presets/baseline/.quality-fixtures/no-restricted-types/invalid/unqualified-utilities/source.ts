type Shape = {
  id: number;
  name: string;
};

type Picked = Pick<Shape, 'id'>;
type Omitted = Omit<Shape, 'name'>;
type PartialShape = Partial<Shape>;
type NonNull = NonNullable<string | null>;

interface OmittedInterface extends Omit<Shape, 'name'> {
  active: boolean;
}

class PartialImplementation implements Partial<Shape> {}
