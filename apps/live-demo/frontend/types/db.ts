type Employee = {
  $meta: {
    pk: "uuid";
  };
  $fields: {
    uuid: number;
    user_id: number;
    name: string;
  };
};

export type DB = {
  employees: Employee;
};
