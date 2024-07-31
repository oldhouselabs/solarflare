export type Todo = {
  $meta: {
    pk: "id";
  };
  $fields: {
    id: number;
    text: string;
    status: "todo" | "in-progress" | "done";
    rank: string;
    created_at: any;
  };
};

export type DB = {
  todos: Todo;
};
