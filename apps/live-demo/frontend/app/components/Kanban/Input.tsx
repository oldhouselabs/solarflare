import React from "react";

interface InputProps {
  type: string;
  name: string;
  placeholder?: string;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const Input = ({ name, value, placeholder, onChange }: InputProps) => {
  return (
    <input
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      className="border p-2 w-full rounded-lg shadow-lg hover:shadow-xl"
    ></input>
  );
};

export default Input;
