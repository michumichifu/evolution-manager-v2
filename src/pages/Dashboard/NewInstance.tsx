import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import { Button } from "@evoapi/design-system/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormInput, FormSelect } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import { getProvider } from "@/lib/queries/token";
import { useManageInstance } from "@/lib/queries/instance/manageInstance";

import { NewInstance as NewInstanceType } from "@/types/evolution.types";

import { GoNewInstance } from "./GoNewInstance";

const stringOrUndefined = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const FormSchema = z.object({
  name: z.string(),
  token: stringOrUndefined,
  number: stringOrUndefined,
  businessId: stringOrUndefined,
  integration: z.enum(["WHATSAPP-BUSINESS", "WHATSAPP-BAILEYS", "EVOLUTION"]),
});

function NewInstance({ resetTable, open, onOpenChange }: { resetTable: () => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const { createInstance } = useManageInstance();
  const setOpen = onOpenChange;
  const options = [
    {
      value: "WHATSAPP-BAILEYS",
      label: t("instance.form.integration.baileys"),
    },
    {
      value: "WHATSAPP-BUSINESS",
      label: t("instance.form.integration.whatsapp"),
    },
    {
      value: "EVOLUTION",
      label: t("instance.form.integration.evolution"),
    },
  ];

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: "",
      integration: "WHATSAPP-BAILEYS",
      token: uuidv4().replace("-", "").toUpperCase(),
      number: "",
      businessId: "",
    },
  });

  const integrationSelected = form.watch("integration");

  // Auto-limpiar token si se selecciona Cloud API para no dejar el UUID de Baileys
  useEffect(() => {
    if (integrationSelected === "WHATSAPP-BUSINESS") {
      const curToken = form.getValues("token");
      if (!curToken || curToken.length <= 36) {
        form.setValue("token", "");
      }
    } else if (integrationSelected === "WHATSAPP-BAILEYS") {
      const curToken = form.getValues("token");
      if (!curToken || curToken.startsWith("EAA")) {
        form.setValue("token", uuidv4().replace("-", "").toUpperCase());
      }
    }
  }, [integrationSelected]);

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      let profileName: string | null = null;
      let profilePicUrl: string | null = null;

      // Auto-consultar Meta Graph API para traer nombre y foto oficial del negocio
      if (data.integration === "WHATSAPP-BUSINESS" && data.number && data.token) {
        try {
          const [infoRes, picRes] = await Promise.allSettled([
            fetch(`https://graph.facebook.com/v21.0/${data.number}?fields=verified_name`, {
              headers: { Authorization: `Bearer ${data.token}` },
            }),
            fetch(`https://graph.facebook.com/v21.0/${data.number}/whatsapp_business_profile?fields=profile_picture_url`, {
              headers: { Authorization: `Bearer ${data.token}` },
            }),
          ]);

          if (infoRes.status === "fulfilled" && infoRes.value.ok) {
            const infoData = await infoRes.value.json();
            if (infoData.verified_name) profileName = infoData.verified_name;
          }
          if (picRes.status === "fulfilled" && picRes.value.ok) {
            const picData = await picRes.value.json();
            if (picData.data?.[0]?.profile_picture_url) {
              profilePicUrl = picData.data[0].profile_picture_url;
            }
          }
        } catch (fetchErr) {
          console.warn("Could not auto-fetch Meta profile info:", fetchErr);
        }
      }

      const instanceData: NewInstanceType = {
        instanceName: data.name,
        integration: data.integration,
        token: data.token === "" ? null : data.token,
        number: data.number === "" ? null : data.number,
        businessId: data.businessId === "" ? null : data.businessId,
        profileName,
        profilePicUrl,
      };

      await createInstance(instanceData);

      toast.success(t("toast.instance.created"));
      setOpen(false);
      onReset();
      resetTable();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(`Error : ${error?.response?.data?.response?.message}`);
    }
  };

  const onReset = () => {
    form.reset({
      name: "",
      integration: "WHATSAPP-BAILEYS",
      token: uuidv4().replace("-", "").toLocaleUpperCase(),
      number: "",
      businessId: "",
    });
  };

  if (getProvider() === "go") {
    return <GoNewInstance resetTable={resetTable} open={open} onOpenChange={onOpenChange} />;
  }

  const isCloudApi = integrationSelected === "WHATSAPP-BUSINESS";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[650px]" onCloseAutoFocus={onReset}>
        <DialogHeader>
          <DialogTitle>{t("instance.modal.title")}</DialogTitle>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
            <FormInput required name="name" label={t("instance.form.name")}>
              <Input placeholder={isCloudApi ? "ej: cliente-cloud-api" : ""} />
            </FormInput>
            <FormSelect name="integration" label={t("instance.form.integration.label")} options={options} />
            
            <FormInput
              required
              name="token"
              label={isCloudApi ? "Token Permanente de Meta (EAAG... / EAAndd...)" : t("instance.form.token")}
            >
              <Input placeholder={isCloudApi ? "Pega el Token de acceso permanente de Meta" : ""} />
            </FormInput>
            {isCloudApi && (
              <p className="-mt-2 text-xs text-muted-foreground">
                📌 En Meta Business Suite &gt; Ajustes &gt; Usuarios del sistema &gt; Generar token (con permisos whatsapp_business_messaging).
              </p>
            )}

            <FormInput
              name="number"
              label={isCloudApi ? "Phone Number ID (ID del perfil de teléfono)" : t("instance.form.number")}
            >
              <Input
                type={isCloudApi ? "text" : "tel"}
                placeholder={isCloudApi ? "Ej: 111332491590444 (15 dígitos, NO el número telefónico)" : ""}
              />
            </FormInput>
            {isCloudApi && (
              <p className="-mt-2 text-xs text-muted-foreground">
                📌 En Meta Business Suite &gt; Cuentas de WhatsApp &gt; Clic en el número &gt; Panel lateral "Perfil de teléfono".
              </p>
            )}

            {isCloudApi && (
              <>
                <FormInput required name="businessId" label="WABA ID (ID de la cuenta de WhatsApp)">
                  <Input placeholder="Ej: 100118229397347 (Identificador de la cuenta de WhatsApp)" />
                </FormInput>
                <p className="-mt-2 text-xs text-muted-foreground">
                  📌 En Meta Business Suite &gt; Cuentas de WhatsApp &gt; Identificador (debajo del nombre de la empresa).
                </p>
              </>
            )}
            <DialogFooter>
              <Button type="submit">{t("instance.button.save")}</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export { NewInstance };
