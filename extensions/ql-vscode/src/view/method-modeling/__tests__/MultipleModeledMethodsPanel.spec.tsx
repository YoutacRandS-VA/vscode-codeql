import { render as reactRender, screen, waitFor } from "@testing-library/react";
import { createMethod } from "../../../../test/factories/model-editor/method-factories";
import {
  createNoneModeledMethod,
  createSinkModeledMethod,
  createSourceModeledMethod,
} from "../../../../test/factories/model-editor/modeled-method-factories";
import type { MultipleModeledMethodsPanelProps } from "../MultipleModeledMethodsPanel";
import { MultipleModeledMethodsPanel } from "../MultipleModeledMethodsPanel";
import { userEvent } from "@testing-library/user-event";
import type { ModeledMethod } from "../../../model-editor/modeled-method";
import { QueryLanguage } from "../../../common/query-language";

describe(MultipleModeledMethodsPanel.name, () => {
  const render = (props: MultipleModeledMethodsPanelProps) =>
    reactRender(<MultipleModeledMethodsPanel {...props} />);

  const language = QueryLanguage.Java;
  const method = createMethod();
  const isModelingInProgress = false;
  const modelingStatus = "unmodeled";
  const onChange = jest.fn<void, [string, ModeledMethod[]]>();

  describe("with no modeled methods", () => {
    const modeledMethods: ModeledMethod[] = [];

    it("renders the method modeling inputs once", () => {
      render({
        language,
        method,
        modeledMethods,
        modelingStatus,
        isModelingInProgress,
        onChange,
      });

      expect(screen.getAllByRole("combobox")).toHaveLength(4);
      expect(
        screen.getByRole("combobox", {
          name: "Model type",
        }),
      ).toHaveValue("none");
    });

    it("disables all pagination", () => {
      render({
        language,
        method,
        modeledMethods,
        modelingStatus,
        isModelingInProgress,
        onChange,
      });

      expect(
        screen
          .getByLabelText("Previous modeling")
          .getElementsByTagName("input")[0],
      ).toBeDisabled();
      expect(
        screen.getByLabelText("Next modeling").getElementsByTagName("input")[0],
      ).toBeDisabled();
      expect(screen.queryByText("0/0")).not.toBeInTheDocument();
      expect(screen.queryByText("1/0")).not.toBeInTheDocument();
    });

    it("cannot add or delete modeling", () => {
      render({
        language,
        method,
        modeledMethods,
        modelingStatus,
        isModelingInProgress,
        onChange,
      });

      expect(
        screen
          .getByLabelText("Delete modeling")
          .getElementsByTagName("input")[0],
      ).toBeDisabled();
      expect(
        screen.getByLabelText("Add modeling").getElementsByTagName("input")[0],
      ).toBeDisabled();
    });
  });

  describe("with one modeled method", () => {
    const modeledMethods = [
      createSinkModeledMethod({
        ...method,
        type: "sink",
        input: "Argument[this]",
        kind: "path-injection",
      }),
    ];

    it("renders the method modeling inputs once", () => {
      render({
        language,
        method,
        modeledMethods,
        modelingStatus,
        isModelingInProgress,
        onChange,
      });

      expect(screen.getAllByRole("combobox")).toHaveLength(4);
      expect(
        screen.getByRole("combobox", {
          name: "Model type",
        }),
      ).toHaveValue("sink");
    });

    it("disables all pagination", () => {
      render({
        language,
        method,
        modeledMethods,
        modelingStatus,
        isModelingInProgress,
        onChange,
      });

      expect(
        screen
          .getByLabelText("Previous modeling")
          .getElementsByTagName("input")[0],
      ).toBeDisabled();
      expect(
        screen.getByLabelText("Next modeling").getElementsByTagName("input")[0],
      ).toBeDisabled();
      expect(screen.queryByText("1/1")).not.toBeInTheDocument();
    });

    it("cannot delete modeling", () => {
      render({
        language,
        method,
        modeledMethods,
        modelingStatus,
        isModelingInProgress,
        onChange,
      });

      expect(
        screen
          .getByLabelText("Delete modeling")
          .getElementsByTagName("input")[0],
      ).toBeDisabled();
    });

    it("can add modeling", async () => {
      render({
        language,
        method,
        modeledMethods,
        modelingStatus,
        isModelingInProgress,
        onChange,
      });

      await userEvent.click(screen.getByLabelText("Add modeling"));

      expect(onChange).toHaveBeenCalledWith(method.signature, [
        ...modeledMethods,
        {
          signature: method.signature,
          packageName: method.packageName,
          typeName: method.typeName,
          methodName: method.methodName,
          methodParameters: method.methodParameters,
          type: "none",
        },
      ]);
    });

    it("changes selection to the newly added modeling", async () => {
      const { rerender } = render({
        language,
        method,
        modeledMethods,
        modelingStatus,
        isModelingInProgress,
        onChange,
      });

      await userEvent.click(screen.getByLabelText("Add modeling"));

      rerender(
        <MultipleModeledMethodsPanel
          language={language}
          method={method}
          modeledMethods={
            onChange.mock.calls[onChange.mock.calls.length - 1][1]
          }
          isModelingInProgress={isModelingInProgress}
          modelingStatus={modelingStatus}
          onChange={onChange}
        />,
      );

      expect(screen.getByText("2/2")).toBeInTheDocument();
    });
  });

  describe("with two modeled methods", () => {
    const modeledMethods = [
      createSinkModeledMethod({
        ...method,
      }),
      createSourceModeledMethod({
        ...method,
      }),
    ];

    it("renders the method modeling inputs once", () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      expect(screen.getAllByRole("combobox")).toHaveLength(4);
      expect(
        screen.getByRole("combobox", {
          name: "Model type",
        }),
      ).toHaveValue("sink");
    });

    it("renders the pagination", () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      expect(screen.getByLabelText("Previous modeling")).toBeInTheDocument();
      expect(screen.getByLabelText("Next modeling")).toBeInTheDocument();
      expect(screen.getByText("1/2")).toBeInTheDocument();
    });

    it("disables the correct pagination", async () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      expect(
        screen
          .getByLabelText("Previous modeling")
          .getElementsByTagName("input")[0],
      ).toBeDisabled();
      expect(
        screen.getByLabelText("Next modeling").getElementsByTagName("input")[0],
      ).toBeEnabled();
    });

    it("can use the pagination", async () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      await userEvent.click(screen.getByLabelText("Next modeling"));

      await waitFor(() => {
        expect(
          screen
            .getByLabelText("Previous modeling")
            .getElementsByTagName("input")[0],
        ).toBeEnabled();
      });

      expect(
        screen
          .getByLabelText("Previous modeling")
          .getElementsByTagName("input")[0],
      ).toBeEnabled();
      expect(
        screen.getByLabelText("Next modeling").getElementsByTagName("input")[0],
      ).toBeDisabled();
      expect(screen.getByText("2/2")).toBeInTheDocument();

      expect(
        screen.getByRole("combobox", {
          name: "Model type",
        }),
      ).toHaveValue("source");
    });

    it("correctly updates selected pagination index when the number of models decreases", async () => {
      const { rerender } = render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      await userEvent.click(screen.getByLabelText("Next modeling"));

      rerender(
        <MultipleModeledMethodsPanel
          language={language}
          method={method}
          modeledMethods={[modeledMethods[1]]}
          isModelingInProgress={isModelingInProgress}
          modelingStatus={modelingStatus}
          onChange={onChange}
        />,
      );

      expect(screen.getAllByRole("combobox")).toHaveLength(4);
      expect(
        screen.getByRole("combobox", {
          name: "Model type",
        }),
      ).toHaveValue("source");
    });

    it("does not show errors", () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("can update the first modeling", async () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      const modelTypeDropdown = screen.getByRole("combobox", {
        name: "Model type",
      });

      await userEvent.selectOptions(modelTypeDropdown, "source");

      expect(onChange).toHaveBeenCalledWith(method.signature, [
        {
          signature: method.signature,
          packageName: method.packageName,
          typeName: method.typeName,
          methodName: method.methodName,
          methodParameters: method.methodParameters,
          type: "source",
          output: "ReturnValue",
          kind: "value",
          provenance: "manual",
        },
        ...modeledMethods.slice(1),
      ]);
    });

    it("can update the second modeling", async () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      await userEvent.click(screen.getByLabelText("Next modeling"));

      const modelTypeDropdown = screen.getByRole("combobox", {
        name: "Model type",
      });

      await userEvent.selectOptions(modelTypeDropdown, "sink");

      expect(onChange).toHaveBeenCalledWith(method.signature, [
        ...modeledMethods.slice(0, 1),
        {
          signature: method.signature,
          packageName: method.packageName,
          typeName: method.typeName,
          methodName: method.methodName,
          methodParameters: method.methodParameters,
          type: "sink",
          input: "Argument[this]",
          kind: "value",
          provenance: "manual",
        },
      ]);
    });

    it("can delete modeling", async () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      await userEvent.click(screen.getByLabelText("Delete modeling"));

      expect(onChange).toHaveBeenCalledWith(
        method.signature,
        modeledMethods.slice(1),
      );
    });

    it("can add modeling", async () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      await userEvent.click(screen.getByLabelText("Add modeling"));

      expect(onChange).toHaveBeenCalledWith(method.signature, [
        ...modeledMethods,
        {
          signature: method.signature,
          packageName: method.packageName,
          typeName: method.typeName,
          methodName: method.methodName,
          methodParameters: method.methodParameters,
          type: "none",
        },
      ]);
    });

    it("shows an error when adding a neutral modeling", async () => {
      const { rerender } = render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      await userEvent.click(screen.getByLabelText("Add modeling"));

      rerender(
        <MultipleModeledMethodsPanel
          language={language}
          method={method}
          modeledMethods={
            onChange.mock.calls[onChange.mock.calls.length - 1][1]
          }
          isModelingInProgress={isModelingInProgress}
          modelingStatus={modelingStatus}
          onChange={onChange}
        />,
      );

      const modelTypeDropdown = screen.getByRole("combobox", {
        name: "Model type",
      });

      await userEvent.selectOptions(modelTypeDropdown, "neutral");

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      rerender(
        <MultipleModeledMethodsPanel
          language={language}
          method={method}
          modeledMethods={
            onChange.mock.calls[onChange.mock.calls.length - 1][1]
          }
          isModelingInProgress={isModelingInProgress}
          modelingStatus={modelingStatus}
          onChange={onChange}
        />,
      );

      const kindDropdown = screen.getByRole("combobox", {
        name: "Kind",
      });

      await userEvent.selectOptions(kindDropdown, "source");

      rerender(
        <MultipleModeledMethodsPanel
          language={language}
          method={method}
          modeledMethods={
            onChange.mock.calls[onChange.mock.calls.length - 1][1]
          }
          isModelingInProgress={isModelingInProgress}
          modelingStatus={modelingStatus}
          onChange={onChange}
        />,
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(
        screen.getByText("Error: Conflicting classification"),
      ).toBeInTheDocument();
    });

    it("changes selection to the newly added modeling", async () => {
      const { rerender } = render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      expect(screen.getByText("1/2")).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Add modeling"));

      rerender(
        <MultipleModeledMethodsPanel
          language={language}
          method={method}
          modeledMethods={
            onChange.mock.calls[onChange.mock.calls.length - 1][1]
          }
          isModelingInProgress={isModelingInProgress}
          modelingStatus={modelingStatus}
          onChange={onChange}
        />,
      );

      expect(screen.getByText("3/3")).toBeInTheDocument();
    });
  });

  describe("with three modeled methods", () => {
    const modeledMethods = [
      createSinkModeledMethod({
        ...method,
        input: "Argument[this]",
        kind: "path-injection",
      }),
      createSourceModeledMethod({
        ...method,
        output: "ReturnValue",
        kind: "remote",
      }),
      createSourceModeledMethod({
        ...method,
        output: "ReturnValue",
        kind: "local",
      }),
    ];

    it("can use the pagination", async () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      expect(
        screen
          .getByLabelText("Previous modeling")
          .getElementsByTagName("input")[0],
      ).toBeDisabled();
      expect(
        screen.getByLabelText("Next modeling").getElementsByTagName("input")[0],
      ).toBeEnabled();
      expect(screen.getByText("1/3")).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Next modeling"));

      await waitFor(() => {
        expect(
          screen
            .getByLabelText("Previous modeling")
            .getElementsByTagName("input")[0],
        ).toBeEnabled();
      });

      expect(
        screen
          .getByLabelText("Previous modeling")
          .getElementsByTagName("input")[0],
      ).toBeEnabled();
      expect(
        screen.getByLabelText("Next modeling").getElementsByTagName("input")[0],
      ).toBeEnabled();
      expect(screen.getByText("2/3")).toBeInTheDocument();

      expect(
        screen.getByRole("combobox", {
          name: "Model type",
        }),
      ).toHaveValue("source");

      await userEvent.click(screen.getByLabelText("Next modeling"));

      expect(
        screen
          .getByLabelText("Previous modeling")
          .getElementsByTagName("input")[0],
      ).toBeEnabled();
      expect(
        screen.getByLabelText("Next modeling").getElementsByTagName("input")[0],
      ).toBeDisabled();
      expect(screen.getByText("3/3")).toBeInTheDocument();

      expect(
        screen.getByRole("combobox", {
          name: "Kind",
        }),
      ).toHaveValue("local");

      await userEvent.click(screen.getByLabelText("Previous modeling"));

      await waitFor(() => {
        expect(
          screen
            .getByLabelText("Next modeling")
            .getElementsByTagName("input")[0],
        ).toBeEnabled();
      });

      expect(
        screen
          .getByLabelText("Previous modeling")
          .getElementsByTagName("input")[0],
      ).toBeEnabled();
      expect(
        screen.getByLabelText("Next modeling").getElementsByTagName("input")[0],
      ).toBeEnabled();
      expect(screen.getByText("2/3")).toBeInTheDocument();

      expect(
        screen.getByRole("combobox", {
          name: "Kind",
        }),
      ).toHaveValue("remote");
    });

    it("preserves selection when a modeling other than the selected modeling is removed", async () => {
      const { rerender } = render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      expect(screen.getByText("1/3")).toBeInTheDocument();

      rerender(
        <MultipleModeledMethodsPanel
          language={language}
          method={method}
          modeledMethods={modeledMethods.slice(0, 2)}
          isModelingInProgress={isModelingInProgress}
          modelingStatus={modelingStatus}
          onChange={onChange}
        />,
      );

      expect(screen.getByText("1/2")).toBeInTheDocument();
    });

    it("reduces selection when the selected modeling is removed", async () => {
      const { rerender } = render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      await userEvent.click(screen.getByLabelText("Next modeling"));
      await userEvent.click(screen.getByLabelText("Next modeling"));
      expect(screen.getByText("3/3")).toBeInTheDocument();

      rerender(
        <MultipleModeledMethodsPanel
          language={language}
          method={method}
          modeledMethods={modeledMethods.slice(0, 2)}
          isModelingInProgress={isModelingInProgress}
          modelingStatus={modelingStatus}
          onChange={onChange}
        />,
      );

      expect(screen.getByText("2/2")).toBeInTheDocument();
    });
  });

  describe("with 1 modeled and 1 unmodeled method", () => {
    const modeledMethods = [
      createSinkModeledMethod({
        ...method,
        type: "sink",
        input: "Argument[this]",
        kind: "path-injection",
      }),
      createNoneModeledMethod({
        ...method,
      }),
    ];

    it("can add modeling", () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      expect(
        screen.getByLabelText("Add modeling").getElementsByTagName("input")[0],
      ).toBeEnabled();
    });

    it("can delete first modeling", async () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      await userEvent.click(screen.getByLabelText("Delete modeling"));

      expect(onChange).toHaveBeenCalledWith(
        method.signature,
        modeledMethods.slice(1),
      );
    });

    it("can delete second modeling", async () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      await userEvent.click(screen.getByLabelText("Next modeling"));
      await userEvent.click(screen.getByLabelText("Delete modeling"));

      expect(onChange).toHaveBeenCalledWith(
        method.signature,
        modeledMethods.slice(0, 1),
      );
    });

    it("can add modeling after deleting second modeling", async () => {
      const { rerender } = render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      await userEvent.click(screen.getByLabelText("Next modeling"));
      await userEvent.click(screen.getByLabelText("Delete modeling"));

      expect(onChange).toHaveBeenCalledWith(
        method.signature,
        modeledMethods.slice(0, 1),
      );

      rerender(
        <MultipleModeledMethodsPanel
          language={language}
          method={method}
          modeledMethods={modeledMethods.slice(0, 1)}
          isModelingInProgress={isModelingInProgress}
          modelingStatus={modelingStatus}
          onChange={onChange}
        />,
      );

      onChange.mockReset();
      await userEvent.click(screen.getByLabelText("Add modeling"));

      expect(onChange).toHaveBeenCalledWith(method.signature, [
        ...modeledMethods.slice(0, 1),
        {
          signature: method.signature,
          packageName: method.packageName,
          typeName: method.typeName,
          methodName: method.methodName,
          methodParameters: method.methodParameters,
          type: "none",
        },
      ]);
    });
  });

  describe("with duplicate modeled methods", () => {
    const modeledMethods = [
      createSinkModeledMethod({
        ...method,
      }),
      createSinkModeledMethod({
        ...method,
      }),
    ];

    it("shows errors", () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("shows the correct error message", async () => {
      render({
        language,
        method,
        modeledMethods,
        isModelingInProgress,
        modelingStatus,
        onChange,
      });

      expect(
        screen.getByText("Error: Duplicated classification"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "This method has two identical or conflicting classifications.",
        ),
      ).toBeInTheDocument();

      expect(screen.getByText("1/2")).toBeInTheDocument();

      const button = screen.getByText(
        "Modify or remove the duplicated classification.",
      );

      await userEvent.click(button);

      expect(screen.getByText("2/2")).toBeInTheDocument();

      expect(
        screen.getByText("Modify or remove the duplicated classification."),
      ).toBeInTheDocument();
    });
  });
});
